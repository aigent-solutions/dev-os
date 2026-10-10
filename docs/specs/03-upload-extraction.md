# 03 — PDF Upload & Text Extraction

## 1. Overview

**Builds:**

- The upload half of the review wizard on `/contracts/new`: contract type selector, PDF dropzone, and upload progress.
- A direct browser → Supabase Storage upload.
- The server-side text extraction step, which downloads the PDF **once**, extracts the text with `[PAGE N]` markers, enforces every document limit, and stores the result in `contracts.contract_text`.

**References:** PRD Flow 3 steps 1–2, US-002, FR-02, FR-03, §5 upload constraints. Engineering doc §1.6 D6, §1.7 (Storage deviation), §4.3 steps 1–4 and its error table, §7.4, §7.13, §9.2 (`POST /api/contracts`, `POST /api/contracts/{id}/extract`), F5.

**Depends on:** `00-foundation.md` (clients, `withApiHandler`, `requireUser`, `parseBody`, errors, constants), `supabase-schema.sql` (`contracts`, `guard_contract_columns`, bucket `contracts` and policies), `12-rate-limiting-usage.md` (`enforceRateLimit('upload')`), `13-data-lifecycle-gdpr.md` (owns `DELETE /api/contracts/{id}` and the 24 h `pending_upload` sweep). The term preview shown during upload is `04`. "Process Contract" and everything after it is `05`.

**Why the browser uploads straight to Storage (D6):** Netlify functions reject request bodies over ~6 MB, and binary bodies are base64-encoded on the way in (+33%), so the effective limit is ~4.5 MB. A 10 MB PDF therefore cannot be posted through a Next.js route handler. The browser uploads to the private `contracts` bucket under its own folder (Storage RLS). The server then downloads the object once to extract the text. After that, nothing reads the PDF again except the viewer.

---

## 2. User flow

1. The user clicks "Review a Contract" (dashboard) and lands on `/contracts/new`. The wizard store resets to step `select`.
2. The user chooses **NDA** or **MSA** in `ContractTypeSelect` (required). `TermPreviewCard` (`04`) immediately lists the standard terms.
3. The user drops or picks a PDF in `PdfDropzone`. The client checks: one file, `.pdf` extension, MIME `application/pdf`, size ≤ 10,485,760 bytes. A failure shows an inline error and nothing is sent.
4. The dropzone is disabled until a type is chosen. The helper reads "Choose a contract type first."
5. As soon as a valid file is chosen, `useUploadContract` starts:
   1. `POST /api/contracts { file_name, file_size, contract_type }` → `{ contract_id, storage_bucket, storage_path }`. Wizard step → `uploading`.
   2. `supabase.storage.from('contracts').upload(storage_path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' })`. `ProcessingSteps` step 1 "Extracting text" is shown as active.
   3. Wizard step → `extracting`. `POST /api/contracts/{id}/extract`.
   4. Success → store `pageCount` and step → `ready`. The UI shows "✓ {file_name} · {page_count} pages", and the "Process Contract" button (`05`) becomes enabled.
6. On any failure the wizard shows the error message from the catalog (README §4) and a "Choose another file" button. This resets `file`, `contractId` and `error`, and keeps `contractType` and `customTerms`.
7. The user may click "Remove file" in step `ready`. The client calls `DELETE /api/contracts/{id}` (`13`) and resets to `select` with the type kept.

---

## 3. Database

| Step | Table | Operation | Client |
|---|---|---|---|
| Create | `contracts` | `INSERT { id, user_id, file_name, file_path, file_size_bytes, contract_type }`. `status` defaults to `pending_upload` | **User-scoped.** Allowed by `contracts_insert_own`. `guard_contract_columns` requires `status = 'pending_upload'`, server-managed columns null or default, and `file_path LIKE '{user_id}/{id}/%'` |
| Extract — load | `contracts` | `SELECT id, user_id, status, file_path, file_size_bytes FROM contracts WHERE id = $1` | **User-scoped** (RLS proves ownership; 0 rows → 404) |
| Extract — success | `contracts` | `UPDATE contracts SET contract_text = $t, page_count = $p, word_count = $w, token_count = $k, status = 'ready' WHERE id = $1 AND user_id = $2 AND status = 'pending_upload'` | **Admin** (server-managed columns; README §3.9 use 1) |
| Extract — failure cleanup | `contracts` | `DELETE FROM contracts WHERE id = $1` | **User-scoped** (`contracts_delete_own`) |
| Storage — upload | `storage.objects` | INSERT under `{user_id}/…` | Browser client (policy `contracts_objects_insert_own`, bucket `file_size_limit = 10485760`, `allowed_mime_types = {application/pdf}`) |
| Storage — download | `storage.objects` | `download(file_path)` | **Admin** (README §3.9 use 6), after the path-prefix assertion |
| Storage — cleanup | `storage.objects` | `remove([file_path])` | **Admin**, after the path-prefix assertion |

Exact supabase-js calls:

```ts
// create (user client)
await supabase.from('contracts').insert({
  id: contractId, user_id: user.id, file_name, file_path: storagePath,
  file_size_bytes: file_size, contract_type,
});

// extract success (admin client)
const { data, error } = await admin.from('contracts')
  .update({ contract_text: text, page_count: pageCount, word_count: wordCount, token_count: tokenCount, status: 'ready' })
  .eq('id', contractId).eq('user_id', user.id).eq('status', 'pending_upload')
  .select('id').maybeSingle();
// data === null → a concurrent request already moved the row on → ConflictError INVALID_STATUS
```

---

## 4. Database tasks

All present in `supabase-schema.sql`:

- [ ] `contracts` with constraints `contracts_file_size_range`, `contracts_page_count_range` (1–20), `contracts_word_count_min` (≥ 100), `contracts_token_count_max` (≤ 15,000), `contracts_text_required`.
- [ ] Trigger `trg_contracts_guard_columns` (BEFORE INSERT OR UPDATE).
- [ ] Index `idx_contracts_pending` (used by the 24 h sweep in `13`).
- [ ] Bucket `contracts` (private, 10 MB, PDF only) and policies `contracts_objects_{insert,select,delete}_own`.

The DB constraints are a **backstop**. The route validates every limit first and returns the specific error code. A constraint violation reaching the handler is a bug (it is logged as `INTERNAL_ERROR`).

---

## 5. API routes

### 5.1 `POST /api/contracts` — create upload record

| Field | Value |
|---|---|
| File | `src/app/api/contracts/route.ts` (`POST`; `GET` list is owned by `10`) |
| Auth | Required (`requireUser`) |
| Rate limit | `upload` (20 / hour) |
| Request | `{ "file_name": string, "file_size": integer, "contract_type": "nda" \| "msa" }` |
| Validation (`CreateContractSchema`, `src/lib/validation/contract.ts`) | `file_name`: trimmed, 1–255 characters, `/\.pdf$/i`. `file_size`: integer 1..`MAX_FILE_BYTES` (a larger value → `413 FILE_TOO_LARGE`, not 400). `contract_type`: `z.enum(['nda','msa'])` |
| Response `201` | `{ "contract_id": "<uuid>", "storage_bucket": "contracts", "storage_path": "<user_id>/<contract_id>/<safe_name>.pdf" }` |
| Errors | `400 VALIDATION_ERROR`, `401`, `413 FILE_TOO_LARGE`, `429 RATE_LIMITED` |

```ts
export const CreateContractSchema = z.object({
  file_name: z.string().trim().min(1).max(255).regex(/\.pdf$/i, 'File must be a .pdf'),
  file_size: z.number().int().min(1),             // the upper bound is checked separately → 413
  contract_type: z.enum(['nda', 'msa']),
});
```

### 5.2 `POST /api/contracts/{id}/extract` — server-side text extraction

| Field | Value |
|---|---|
| File | `src/app/api/contracts/[id]/extract/route.ts` |
| Auth | Required, owner |
| Rate limit | None of its own (it is bounded by `upload`, since each contract can be extracted only once) |
| Params | `{ id: uuid }` (`parseParams`, `z.object({ id: z.string().uuid() })`) |
| Request | Empty body |
| Response `200` | `{ "contract_id": "<uuid>", "status": "ready", "page_count": 7, "word_count": 3120, "token_count": 4410 }` |
| Errors | `404 NOT_FOUND`. `409 INVALID_STATUS` (status ≠ `pending_upload`). `422 NOT_A_PDF`, `PDF_ENCRYPTED`, `PDF_UNREADABLE`, `TOO_MANY_PAGES` (`details.page_count`), `SCANNED_PDF` (`details.word_count`), `CONTRACT_TOO_LONG` (`details.token_count`). `413 FILE_TOO_LARGE`. `502 STORAGE_UNAVAILABLE` |
| Cleanup | **Every 4xx/422 from validation deletes both the Storage object and the contract row before responding** (no partial output). `502 STORAGE_UNAVAILABLE` does **not** clean up: the client retries `/extract` once, then calls `DELETE /api/contracts/{id}` |
| Duration | Must finish well within Netlify's synchronous limit. Budget: download ≤ 4 s, parse ≤ 6 s for 20 pages / 10 MB |

---

## 6. Backend implementation

### 6.1 `contracts.service.ts → createContract`

```ts
export async function createContract(
  supabase: SupabaseClient<Database>, user: User,
  input: { file_name: string; file_size: number; contract_type: ContractType },
): Promise<{ contract_id: string; storage_bucket: 'contracts'; storage_path: string }> {
  if (input.file_size > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  const contractId = crypto.randomUUID();
  const storagePath = `${user.id}/${contractId}/${safeFileName(input.file_name)}`;
  const { error } = await supabase.from('contracts').insert({
    id: contractId, user_id: user.id, file_name: input.file_name, file_path: storagePath,
    file_size_bytes: input.file_size, contract_type: input.contract_type,
  });
  if (error) throw error; // unexpected → 500
  return { contract_id: contractId, storage_bucket: STORAGE_BUCKET, storage_path: storagePath };
}
```

Route handler order: `requireUser` → `parseBody(CreateContractSchema)` → `enforceRateLimit(user.id, 'upload')` → `createContract` → `Response.json(result, { status: 201 })`.

`safeFileName` (README §3.4): `"Acme Mutual NDA (v2).PDF"` → `"acme_mutual_nda_v2.pdf"`. Empty slug → `"contract.pdf"`. The original name is kept in `contracts.file_name` for display.

### 6.2 `contracts.service.ts → extractContractText`

```ts
export async function extractContractText(
  supabase: SupabaseClient<Database>, user: User, contractId: string, log: Logger,
): Promise<{ contract_id: string; status: 'ready'; page_count: number; word_count: number; token_count: number }>
```

Steps:

1. **Load (user client):** `select('id, user_id, status, file_path, file_size_bytes').eq('id', contractId).maybeSingle()`. `null` → `NotFoundError`.
2. `status !== 'pending_upload'` → `appError('INVALID_STATUS')` (no cleanup; the row is in a valid later state).
3. **Path assertion:** `file_path` must be non-null and start with `` `${user.id}/${contractId}/` ``. Otherwise → log `error` with `msg: 'file_path_prefix_mismatch'` and throw `INTERNAL_ERROR`. This cannot happen given the guard trigger, but it is checked before any service-role Storage call (README §3.9).
4. **Download (admin):** `admin.storage.from(STORAGE_BUCKET).download(file_path)`.
   - The error is "not found" (`statusCode === '404'`, or a message matching `/not found/i`) → the upload never completed. Clean up (step 9) and throw `appError('PDF_UNREADABLE')`.
   - Any other error, or a thrown network error → throw `appError('STORAGE_UNAVAILABLE')`, without cleanup.
5. `const buf = Buffer.from(await blob.arrayBuffer())`. Then `assertPdfBuffer(buf)`, which throws `FILE_TOO_LARGE` if `buf.length > MAX_FILE_BYTES` and `NOT_A_PDF` if the first 5 bytes are not `%PDF-`.
6. `const { text, pageCount, wordCount } = await extractPdfText(buf)` (§6.3). It throws `PDF_ENCRYPTED`, `PDF_UNREADABLE` or `TOO_MANY_PAGES`.
7. Limits, checked in this order:
   1. `pageCount > MAX_PAGES` → `TOO_MANY_PAGES { page_count }` (raised inside `extractPdfText` before rendering pages).
   2. `wordCount < MIN_WORDS` → `SCANNED_PDF { word_count }`.
   3. `tokenCount = countTokens(text)`. Above `MAX_CONTRACT_TOKENS` → `CONTRACT_TOO_LONG { token_count }`.
8. **Persist (admin):** the update shown in §3. `null` → `INVALID_STATUS`. Return the 200 body.
9. **Cleanup on any 413/422 from steps 4–7:** run `admin.storage.from(STORAGE_BUCKET).remove([file_path])` (errors logged, not thrown), then `supabase.from('contracts').delete().eq('id', contractId)` (user client). Then rethrow the original error. Implement this as a `try/catch` around steps 4–7 that inspects `err instanceof AppError && (err.status === 413 || err.status === 422)`.

Logging: `log.info('contract_extracted', { contract_id, page_count, word_count, token_count, duration_ms })`. Never log text.

### 6.3 `src/lib/pdf/extract-text.ts`

> **Implementation note (F5):** the shipped extractor uses `pdfjs-dist` 4.8.69 (`pdfjs-dist/legacy/build/pdf.mjs`, loaded lazily, listed in `serverComponentsExternalPackages` and Netlify `external_node_modules`) instead of `pdf-parse` 1.1.1, which fails intermittently across documents in one process. Behaviour below (markers, limits, error mapping) is unchanged. See README §6 row 15.

Dependencies:

- `pdf-parse@1.1.1`, imported as `pdf-parse/lib/pdf-parse.js`. This skips the package's debug entry point, which reads a test file on import.
- Type shim `src/types/pdf-parse.d.ts`.
- `next.config.mjs` must list `pdf-parse` in `experimental.serverComponentsExternalPackages` (owned by `00`).

```ts
import '@/lib/server-guard'; // 00 §6.12 rule 1
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { MAX_PAGES } from '@/lib/constants';
import { appError } from '@/lib/api/errors';
import { pageMarker } from './page-markers';

type TextItem = { str: string; transform: number[]; hasEOL?: boolean };

/** Renders one page as `[PAGE N]\n<text>`, keeping line breaks by y-position. */
async function renderPage(pageData: {
  pageIndex: number;
  getTextContent(opts: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<{ items: TextItem[] }>;
}): Promise<string> {
  const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
  let lastY: number | undefined;
  let out = '';
  for (const item of content.items) {
    const y = item.transform[5];
    if (lastY === undefined || Math.abs(y - lastY) < 1) {
      out += item.str;                       // same line
    } else {
      out += '\n' + item.str;                // new line
    }
    lastY = y;
  }
  return `${pageMarker(pageData.pageIndex + 1)}\n${out}`;
}

export async function extractPdfText(buf: Buffer): Promise<{ text: string; pageCount: number; wordCount: number }> {
  let data: { numpages: number; text: string };
  try {
    data = await pdfParse(buf, { pagerender: renderPage, max: MAX_PAGES + 1 });
  } catch (err) {
    const name = (err as { name?: string })?.name ?? '';
    if (name === 'PasswordException' || /password/i.test(String((err as Error)?.message))) {
      throw appError('PDF_ENCRYPTED');
    }
    throw appError('PDF_UNREADABLE');
  }
  if (data.numpages > MAX_PAGES) throw appError('TOO_MANY_PAGES', { page_count: data.numpages });
  if (data.numpages < 1) throw appError('PDF_UNREADABLE');

  const text = normaliseExtractedText(data.text);
  return { text, pageCount: data.numpages, wordCount: countWords(text) };
}

/** Clean-up that keeps the [PAGE N] markers and line structure intact. */
export function normaliseExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')                  // NULs break Postgres text
    .replace(/­/g, '')                  // soft hyphens
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+\n/g, '\n')          // trailing spaces
    .replace(/\n{3,}/g, '\n\n')              // collapse blank runs
    .trim();
}

/** Words = whitespace-separated tokens with at least one letter or digit, page markers excluded. */
export function countWords(text: string): number {
  return text.replace(/\[PAGE \d+\]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
```

Notes:

- `pdf-parse` 1.1.1 renders pages **sequentially** and joins them with `\n\n`, so markers appear in ascending order. `max: MAX_PAGES + 1` caps rendering work for oversize files. `numpages` still reports the true total, so `TOO_MANY_PAGES` reports the real count.
- `pageIndex` is pdf.js's 0-based index on `PDFPageProxy` (pdf.js v1.10.100 bundled in pdf-parse 1.1.1), so the marker is `pageIndex + 1`.
- Every page gets a marker, including empty ones. `splitPages` and the text viewer (`07`) rely on markers 1..`page_count` all being present.
- A pdf.js `PasswordException` (`name === 'PasswordException'`) covers both user-password and owner-password-with-restrictions-that-block-extraction files.

### 6.4 `src/lib/pdf/validate-pdf.ts`

```ts
export function assertPdfBuffer(buf: Buffer): void {
  if (buf.length > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw appError('NOT_A_PDF');
}
```

### 6.5 `src/lib/pdf/page-markers.ts` (shared with `05` and `07`)

```ts
export const PAGE_MARKER_REGEX = /\[PAGE (\d+)\]/g;
export function pageMarker(n: number): string { return `[PAGE ${n}]`; }

export function splitPages(text: string): { page: number; text: string }[] {
  const re = new RegExp(PAGE_MARKER_REGEX.source, 'g');
  const pages: { page: number; text: string }[] = [];
  let m: RegExpExecArray | null; let prev: { page: number; start: number } | null = null;
  while ((m = re.exec(text))) {
    if (prev) pages.push({ page: prev.page, text: text.slice(prev.start, m.index).trim() });
    prev = { page: Number(m[1]), start: m.index + m[0].length };
  }
  if (prev) pages.push({ page: prev.page, text: text.slice(prev.start).trim() });
  return pages;
}

/** Page of the nearest [PAGE N] marker at or before `offset`; null if none. */
export function pageAtOffset(text: string, offset: number): number | null {
  const re = new RegExp(PAGE_MARKER_REGEX.source, 'g');
  let page: number | null = null; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index <= offset) page = Number(m[1]);
  return page;
}
```

### 6.6 `src/lib/ai/token-count.ts`

```ts
import { getEncoding, type Tiktoken } from 'js-tiktoken';
let enc: Tiktoken | null = null;
export function countTokens(text: string): number {
  enc ??= getEncoding('o200k_base');
  return enc.encode(text).length;
}
```

Markers are counted (they are sent to the model). For a 20-page contract the cost is ~200 tokens.

---

## 7. State management

**`useUploadWizardStore`** (README §3.10). The step transitions this spec owns:

```
select ──(valid file, type set)──▶ uploading ──(upload OK)──▶ extracting ──(200)──▶ ready
   ▲                                   │                          │
   └──────────── error (reset file/contractId; keep type & customTerms) ◀──┘
ready ──(Process Contract, spec 05)──▶ processing
```

- `uploadProgress`: supabase-js `upload()` has no progress callback. Set it to `0` at start, show an **indeterminate** bar with the label "Uploading {size MB}…", and set it to `100` on success.
- `error: { code, message }` comes from the API error envelope or the Storage error mapping (§10).
- `reset()` on mount of `/contracts/new` and after leaving to `/contracts/{id}`.

**`useUploadContract`** (`src/hooks/useUploadContract.ts`), a TanStack `useMutation`:

```ts
type UploadArgs = { file: File; contractType: ContractType };
mutationFn: async ({ file, contractType }) => {
  const created = await apiFetch<CreateContractResponse>('/api/contracts', { method: 'POST',
    json: { file_name: file.name, file_size: file.size, contract_type: contractType } });
  store.setContractId(created.contract_id); store.setStep('uploading');

  const { error: upErr } = await createBrowserSupabase().storage
    .from(created.storage_bucket)
    .upload(created.storage_path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' });
  if (upErr) {
    await apiFetch(`/api/contracts/${created.contract_id}`, { method: 'DELETE' }).catch(() => {}); // owned by spec 13; sweep is the backstop
    throw mapStorageUploadError(upErr);
  }

  store.setStep('extracting');
  try {
    return await apiFetch<ExtractResponse>(`/api/contracts/${created.contract_id}/extract`, { method: 'POST', timeoutMs: 30_000 });
  } catch (e) {
    if (e instanceof ApiClientError && e.code === 'STORAGE_UNAVAILABLE') {
      await sleep(1000);
      try { return await apiFetch<ExtractResponse>(`/api/contracts/${created.contract_id}/extract`, { method: 'POST', timeoutMs: 30_000 }); }
      catch (e2) { await apiFetch(`/api/contracts/${created.contract_id}`, { method: 'DELETE' }).catch(() => {}); throw e2; }
    }
    throw e; // 422/413: the server already cleaned up
  }
}
onSuccess: (r) => { store.setPageCount(r.page_count); store.setStep('ready'); }
onError:   (e) => { store.setError(toWizardError(e)); store.resetFile(); }
```

`apiFetch` (`src/lib/api-client.ts`, `00-foundation.md` §6.10) parses the error envelope into `ApiClientError { status, code, message, retryable, details, requestId, retryAfterSeconds }`.

`mapStorageUploadError(err)`:

- `statusCode` 413, or a message matching `/maximum allowed size|too large/i` → `{ code: 'FILE_TOO_LARGE' }`.
- 415, or `/mime type/i` → `{ code: 'NOT_A_PDF' }`.
- Anything else → `{ code: 'UPLOAD_FAILED', message: "We couldn't upload your file. Check your connection and try again." }`. This is a client-only code and is not in the server catalog.

No Query cache is touched until processing (`05`).

---

## 8. Components

`src/app/(app)/contracts/new/page.tsx` is a server component. It renders the page title "Review a Contract" and `<UploadWizard />`. All components below are `"use client"` in `src/components/upload/`.

```
UploadWizard
├── ContractTypeSelect
├── PdfDropzone ── UploadProgress (while uploading/extracting)
├── ProcessingSteps (spec 05; step 1 active during uploading/extracting)
├── TermPreviewCard (spec 04)
└── ProcessContractButton (spec 05; enabled only in step 'ready')
```

Layout: two columns at ≥ 1024 px (left: type, dropzone and progress; right: `TermPreviewCard`). A single column below that.

### 8.1 `UploadWizard`

Reads and writes `useUploadWizardStore` and calls `useUploadContract().mutate({ file, contractType })` when a valid file is set and the step is `select`. It renders the error banner (`role="alert"`) with the catalog message and a "Choose another file" button. In step `ready` it shows the file summary and a "Remove file" link button. It calls `reset()` on unmount.

### 8.2 `ContractTypeSelect`

| Prop | Type |
|---|---|
| `value` | `ContractType \| null` |
| `onChange` | `(t: ContractType) => void` (calls store `setContractType`, from `04`) |
| `disabled` | `boolean` (true from `uploading` onwards; the type is fixed once the row is created) |

A Radix `Select` with label "Contract type" (`<label htmlFor>`) and options "NDA — Non-Disclosure Agreement" and "MSA — Master Service Agreement". Required, with a placeholder "Select a contract type". When it is disabled, a helper explains: "To change the type, remove the file first."

### 8.3 `PdfDropzone`

| Prop | Type |
|---|---|
| `disabled` | `boolean` (no type chosen, or step ≠ `select`) |
| `onFile` | `(file: File) => void` |
| `onReject` | `(code: 'NOT_A_PDF' \| 'FILE_TOO_LARGE' \| 'TOO_MANY_FILES') => void` |

- `react-dropzone`: `accept: { 'application/pdf': ['.pdf'] }`, `maxSize: MAX_FILE_BYTES`, `maxFiles: 1`, `multiple: false`.
- Rejection codes map as follows: `file-invalid-type` → `NOT_A_PDF`, `file-too-large` → `FILE_TOO_LARGE`, `too-many-files` → `TOO_MANY_FILES` ("Please upload one PDF at a time.").
- Visible text: "Drag and drop your PDF here, or **browse**" and "PDF only · up to 10 MB · up to 20 pages".
- The root is a `<div role="button" tabIndex={0}>` with `aria-describedby` pointing at the limits text. Enter and Space open the file picker. A drag-active state changes the border colour.
- Mobile (< 768 px): shows the note "For the best experience with large PDFs, use a desktop browser (Chrome/Firefox)."

### 8.4 `UploadProgress`

| Prop | Type |
|---|---|
| `phase` | `'uploading' \| 'extracting'` |
| `fileName` | `string` |
| `fileSize` | `number` |

- An indeterminate progress bar (`role="progressbar"`, no `aria-valuenow`, `aria-label` "Uploading {fileName}" or "Extracting text from {fileName}").
- The label reads "Uploading {x.x} MB…" or "Reading your contract…".
- Wrapped in an `aria-live="polite"` region.

---

## 9. Design

- **Dropzone:** surface White, 2 px dashed border Grey 100. On drag-active or hover, the border becomes Blue 500 and the background Blue 50. When disabled: Grey 25 background, Grey 300 text, `cursor-not-allowed`.
- **Text:** primary Grey 900 (Paragraph Large / Medium). Limits text is Paragraph Small Grey 500. The "browse" link is Blue 500.
- **Progress bar:** track Grey 50, indicator Blue 500. The indeterminate animation is disabled under `prefers-reduced-motion` (it becomes a static 40% bar with the label).
- **Error banner:** Red 50 background, Red 500 icon (`AlertCircle`), Grey 900 text.
- **Success summary:** Green 500 check icon, Grey 900 file name, Grey 500 page count.
- Spacing on the 4 px grid (gap 16/24). Radius per `docs/design.md`. Tailwind token classes only (`00` §9).

---

## 10. Edge cases

From engineering doc §4.3 (error table), plus implementation-level cases.

| Condition | Detected at | User message | State after |
|---|---|---|---|
| Not a PDF (extension or MIME) | Dropzone | "Please upload a PDF under 10 MB." | Nothing created |
| > 10 MB | Dropzone. `POST /api/contracts` → 413 if the client is bypassed. The bucket `file_size_limit` → Storage error if both are bypassed | "Please upload a PDF under 10 MB." | No row, or the row is deleted by the client after the Storage error |
| More than one file dropped | Dropzone | "Please upload one PDF at a time." | Nothing created |
| File renamed to `.pdf` but not a PDF | `/extract` magic-bytes check → `NOT_A_PDF` | "Please upload a PDF under 10 MB." | Row and object deleted |
| Storage upload fails (network or outage) | `upload()` error | "We couldn't upload your file. Check your connection and try again." | Client calls `DELETE /api/contracts/{id}`. If that fails too, the 24 h sweep (`13`) removes the `pending_upload` row and any object |
| Object already exists at the path (double submit) | `upload()` 409 (`upsert: false`) | Same as the upload failure | Same. A new attempt gets a new `contract_id` |
| Storage reachable for upload, unreachable for the server download | `/extract` → 502 | After one automatic retry: "We couldn't reach file storage. Please try again in a few minutes." | Client deletes the row |
| Object missing at `/extract` (upload never finished) | `/extract` download 404 → `PDF_UNREADABLE` | "We couldn't read this PDF. It may be password-protected or corrupted." | Row and object deleted |
| > 20 pages | `/extract` | "This contract has {n} pages. ContractIQ currently supports up to 20 pages." | Row and object deleted |
| < 100 words (scanned or image PDF) | `/extract` | "Scanned PDFs are not supported yet. Please upload a PDF with selectable text." | Row and object deleted |
| > 15,000 tokens | `/extract` | "This contract is too long for ContractIQ right now (max ~15,000 tokens). Longer contract support is coming." | Row and object deleted |
| Password-protected | `/extract` → `PDF_ENCRYPTED` | "We couldn't read this PDF. It may be password-protected or corrupted." | Row and object deleted |
| Corrupted PDF (pdf.js throws) | `/extract` → `PDF_UNREADABLE` | Same as above | Row and object deleted |
| `/extract` called twice concurrently | The second request's update matches 0 rows → `409 INVALID_STATUS` | None (the client only calls once) | The first succeeds |
| `/extract` on someone else's contract | User-client load returns null → 404 | — | — |
| User closes the tab mid-upload | — | — | A `pending_upload` row (and maybe a partial object) remains. The sweep cleans it after 24 h |
| Rate limit hit on create | `POST /api/contracts` → 429 | "You're doing that a lot — please wait {retry_after} seconds and try again." | Nothing created |
| Non-English or non-contract PDF with a text layer | Not detected here | — | Proceeds. The type mismatch is flagged after processing (`05`) |

---

## 11. Acceptance criteria

- [ ] A valid ≤ 10 MB, ≤ 20-page text PDF reaches step `ready` with `contracts.status = 'ready'` and `contract_text` containing `[PAGE 1]` … `[PAGE n]` in order, with `n = page_count`.
- [ ] The PDF bytes never pass through a Next.js route handler. The only server-side read is the single admin download in `/extract`.
- [ ] Each limit violation (> 10 MB, > 20 pages, < 100 words, > 15,000 tokens, encrypted, corrupted, not a PDF) shows the exact message in §10, and leaves **no** `contracts` row and **no** Storage object.
- [ ] A Storage upload failure leaves no row (via the client DELETE) or the row is gone within 24 h (sweep).
- [ ] `/extract` on a contract that isn't `pending_upload` → 409. On another user's contract → 404.
- [ ] The term preview (`04`) is visible as soon as a type is chosen, including during upload and extraction.
- [ ] Users cannot set `status`, `contract_text` or counts on insert, or a `file_path` outside their folder (DB guard).
- [ ] `/extract` for a 20-page, 10 MB PDF completes in < 10 s on Netlify (P95).

---

## 12. Tests

**Unit (Vitest)**

- `tests/unit/lib/pdf/extract-text.test.ts`, using real `pdf-parse` on fixtures:
  - `tests/fixtures/pdfs/nda-3p.pdf` produces markers `[PAGE 1]`–`[PAGE 3]` in order, `pageCount 3` and `wordCount > 100`.
  - `scanned-1p.pdf` → `wordCount < 100`.
  - `encrypted.pdf` → `PDF_ENCRYPTED`.
  - `corrupt.pdf` → `PDF_UNREADABLE`.
  - `msa-21p.pdf` → `TOO_MANY_PAGES` with `page_count: 21`.
  - A blank middle page still gets a marker.
- `normaliseExtractedText` (NULs, soft hyphens, CRLF, blank-line collapse) and `countWords` (markers excluded, punctuation-only tokens excluded).
- `page-markers.test.ts`:
  - `splitPages` round-trip.
  - `pageAtOffset` before the first marker → `null`, inside page 2 → 2, exactly at a marker index → that page.
- `validate-pdf.test.ts`: the magic-bytes check and the size boundary at 10,485,760 / 10,485,761.
- `token-count.test.ts`: a known string with a known count, and the boundary at 15,000 / 15,001 (synthetic text).
- `CreateContractSchema`: `.PDF` uppercase accepted, `.pdf.exe` rejected, 255/256-character names.
- `safeFileName` cases.
- Components:
  - `PdfDropzone` rejection mapping, and disabled until a type is chosen.
  - `UploadWizard` step transitions with a mocked `useUploadContract`.
  - The error banner has `role="alert"`.

**Integration (Vitest + local Supabase + real Storage)** — `tests/integration/upload-extract.test.ts`

- Happy path: create → upload as the user → extract → row `ready` with all counts. The object exists at `{user_id}/{id}/…`.
- 21-page, scanned, encrypted, too-long, not-a-PDF (`.pdf` text file) → the correct 422 code, plus the row and object deleted.
- Object missing → `PDF_UNREADABLE` and cleanup.
- Status `ready` → `/extract` 409.
- User B extracting user A's contract → 404.
- The user client inserting `{ status: 'ready' }` or `file_path: '<other-user>/x/y.pdf'` → error `42501`.
- The user client updating `contract_text` → `42501`.
- User B uploading into user A's folder → Storage RLS error.
- `POST /api/contracts` with `file_size: 10485761` → 413. The 21st call within an hour → 429.

**E2E (Playwright)**

- `upload-errors.spec.ts`: scanned PDF, 21-page PDF and an 11 MB file each show the exact message, and the dashboard shows no new contract.
- `contract-review.spec.ts` (shared with `05`/`06`): the upload stage reaches "✓ … · N pages" and enables "Process Contract".
