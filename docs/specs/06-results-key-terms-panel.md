# 06 — Results Page & Key Terms Panel

## 1. Overview

**Builds:** the `/contracts/[id]` page and its results view. It covers the page shell that switches on contract status, the responsive two-panel layout, the results header ("Mark review complete"), the legal disclaimer, the type-mismatch and calibration banners, and the key terms panel. The panel shows confidence bands, the ⚠️ low-confidence warning, the "Why?" source-sentence disclosure and the "Not found in document" state. It also covers `GET /api/contracts/{id}`, `PATCH /api/contracts/{id}`, and the `useContract` / `useMarkReviewComplete` hooks.

**References:** engineering-doc §4.3 steps 8–10 and 12, §5.3, §5.4, §5.5, §8.8, §9.2 (`GET`/`PATCH /api/contracts/{id}`). PRD US-003, US-004, FR-04, FR-11, HHH disclaimer.

**Depends on:** `00-foundation.md` (clients, `withApiHandler`, tokens), `supabase-schema.sql`, `05-key-term-extraction.md` (status values, `ProcessingProgress`, `ProcessingError`, `useProcessContract`, `applyProcessingTimeout` behaviour), `04-term-preview-custom-terms.md` (`TERM_LIBRARY` descriptions).

**Consumed by:** `07-document-viewer.md` (left panel), `08-inline-editing.md` (`InlineTermEditor`, `EditedBadge` inside `KeyTermRow`), `09-contract-chat.md` (Chat tab), `11-feedback.md` (`FeedbackWidget` inside the Key Terms tab), `13-data-lifecycle-gdpr.md` (`DeleteContractDialog` and `DELETE` on the same route file).

**Out of scope here:** the `DELETE` handler in `src/app/api/contracts/[id]/route.ts` (spec 13), and the processing and error views (spec 05).

---

## 2. User flow

1. The user opens `/contracts/{id}`, from the dashboard row, from the wizard after "Process Contract", or from a bookmark.
2. The server component authenticates, loads the contract through the user-scoped client and renders by status:
   - `pending_upload` → `UploadIncompleteCard` ("This upload didn't finish." and a "Upload a contract" link to `/contracts/new`).
   - `ready` → `NotAnalysedCard` ("This contract hasn't been analysed yet." and an "Analyse contract" button → `useProcessContract(id).mutate({ custom_terms: [] })` from spec 05).
   - `processing` → `ProcessingProgress` (spec 05). When it reports `completed`, it invalidates `qk.contract(id)` and the results render.
   - `error` → `ProcessingError` and a Retry button (spec 05).
   - `completed` → `ResultsLayout`.
3. In the results view the user sees the disclaimer, any banners, the document viewer (left) and the side panel (right) with "Key Terms" and "Chat" tabs.
4. The key terms list renders in `display_order` (standard library order, then custom terms in the order the user added them). Each row shows: term name (with a "Custom" badge and a jargon tooltip for standard terms), value or "Not found in document", page link, confidence badge, ⚠️ if the score is under 50, the "Why?" disclosure and an "Edited" badge (spec 08).
5. Clicking a row, the term name button or the page link calls `useResultsViewerStore.goToPage(page, { termId, text: source_sentence })`. The viewer scrolls and highlights (spec 07). Low-confidence terms navigate and highlight the same way, so selecting one always auto-highlights its source span.
6. Expanding "Why?" shows the verbatim source sentence, labelled "Source not verified" when `source_verified = false`.
7. The user clicks "Mark review complete" → `PATCH /api/contracts/{id} { review_completed: true }` → the header shows a "Reviewed" pill and an "Undo" link (`review_completed: false`).

---

## 3. Database

All reads and writes in this spec use the **user-scoped** client (`createServerSupabase()`), so RLS enforces ownership. The one exception is `applyProcessingTimeout`, which uses the admin client after the user-scoped load has proved ownership (README §3.9 item 1).

| Operation | Table / object | Client | Query |
|---|---|---|---|
| Load contract | `contracts` | user | `select id, user_id, file_name, file_path, contract_type, detected_contract_type, type_mismatch, status, processing_stage, processing_started_at, page_count, contract_text, error_code, error_message, created_at, review_completed_at, prompt_version from contracts where id = $1` → `.maybeSingle()` |
| Lazy timeout | `contracts` | **admin** | `update contracts set status='error', processing_stage=null, error_code='PROCESSING_TIMEOUT', error_message=<catalog msg> where id=$1 and user_id=$2 and status='processing' and processing_started_at < now() - interval '120 seconds' returning status, error_code, error_message` |
| Touch access time | `contracts` | user | `update contracts set last_accessed_at = now() where id = $1` (the guard trigger allows `last_accessed_at`) |
| Load terms | `key_terms` | user | `select id, term_key, term_name, is_custom, value, page_number, confidence_score, source_sentence, source_verified, is_edited, original_value, original_page_number, edited_at, display_order from key_terms where contract_id = $1 order by display_order asc` (only when `status = 'completed'`) |
| Load custom terms | `custom_key_terms` | user | `select id, term_name from custom_key_terms where contract_id = $1 order by created_at asc` |
| Load feedback | `user_feedback` | user | `select rating, comment, accuracy_rating from user_feedback where contract_id = $1` → `.maybeSingle()` |
| Signed URL | Storage `contracts` | user | `supabase.storage.from(STORAGE_BUCKET).createSignedUrl(file_path, SIGNED_URL_TTL_SECONDS)`. The storage SELECT policy restricts it to the user's own folder |
| Mark reviewed | `contracts` | user | `update contracts set review_completed_at = now() where id = $1 and review_completed_at is null` (or `= null` for undo) |
| Rename | `contracts` | user | `update contracts set file_name = $2 where id = $1` |

Indexes used: PK on `contracts.id`, `idx_key_terms_contract_order`, `idx_custom_terms_contract`, `user_feedback_user_contract_key`.

---

## 4. Database tasks

All objects already exist in `supabase-schema.sql`. Nothing new.

- `contracts.last_accessed_at`, `file_name` and `review_completed_at` are **not** guarded by `guard_contract_columns()`, so the user client may update them. Every other column touched by this spec is read-only for users.
- The storage SELECT policy `contracts_objects_select_own` must exist, otherwise `createSignedUrl` fails. The page still works through the text viewer.
- Seed for local dev (`supabase/seed.sql`, owned by spec 00): one `completed` NDA with 10 key terms covering all three bands, one term with `value = null`, one with `source_verified = false`, and one with `type_mismatch = true, detected_contract_type = 'msa'`.

---

## 5. API routes

File: `src/app/api/contracts/[id]/route.ts` (also holds `DELETE` from spec 13). `export const runtime = 'nodejs'`.

### 5.1 `GET /api/contracts/{id}`

| Field | Value |
|---|---|
| Auth | Required (`requireUser`) |
| Rate limit | None |
| Params | `ContractIdParamsSchema = z.object({ id: z.string().uuid() })` → invalid → 404 `NOT_FOUND` (a malformed ID is treated as not found) |
| Request body | None |

**Response `200`**

```json
{
  "contract": {
    "id": "uuid",
    "file_name": "Acme Mutual NDA.pdf",
    "contract_type": "nda",
    "detected_contract_type": "nda",
    "type_mismatch": false,
    "status": "completed",
    "processing_stage": null,
    "page_count": 6,
    "created_at": "2026-10-09T10:00:00.000Z",
    "review_completed_at": null,
    "prompt_version": "extraction-v1.0",
    "processing_attempts": 1,
    "contract_text": "[PAGE 1]\n…",
    "error": null
  },
  "pdf_url": "https://<project>.supabase.co/storage/v1/object/sign/contracts/…?token=…",
  "pdf_url_expires_at": "2026-10-09T11:00:00.000Z",
  "key_terms": [
    {
      "id": "uuid", "term_key": "governing_law", "term_name": "Governing Law", "is_custom": false,
      "value": "Laws of the State of New York", "page_number": 5, "confidence_score": 92,
      "source_sentence": "This Agreement shall be governed by the laws of the State of New York.",
      "source_verified": true, "is_edited": false, "original_value": null,
      "original_page_number": null, "edited_at": null, "display_order": 6
    }
  ],
  "custom_terms": [{ "id": "uuid", "term_name": "Non-compete radius" }],
  "feedback": { "rating": "up", "comment": null, "accuracy_rating": "yes" }
}
```

- `contract.error` is `{ "code": string, "message": string }` when `status = 'error'`, otherwise `null`.
- `contract_text` is `null` while `pending_upload`.
- `key_terms` is `[]` unless `status = 'completed'`.
- `pdf_url` / `pdf_url_expires_at` are `null` when `file_path` is null (PDF deleted after 90 days), when `status !== 'completed'`, or when signing fails.
- `feedback` is `null` when there is no row. It includes `accuracy_rating` (see spec 11).

**Side effects:** applies the lazy processing timeout. Updates `last_accessed_at`. A failure there is logged at `warn` with code `TOUCH_FAILED` and is not fatal.

**Errors:** `401 UNAUTHORIZED`, `404 NOT_FOUND`, `500 INTERNAL_ERROR`. A signing failure is **not** an error: it gives `pdf_url: null` and a `warn` log `SIGNED_URL_FAILED` with `{ contract_id, storage_error }`.

### 5.2 `PATCH /api/contracts/{id}`

| Field | Value |
|---|---|
| Auth | Required |
| Rate limit | `edit` (120/min) |
| Params | `ContractIdParamsSchema` |
| Body schema | `ContractUpdateSchema` (`src/lib/validation/contract.ts`) |

```ts
export const ContractUpdateSchema = z.object({
  review_completed: z.boolean().optional(),
  file_name: z.string().trim().min(1).max(255).optional(),
}).strict().refine(v => v.review_completed !== undefined || v.file_name !== undefined, {
  message: 'Provide review_completed or file_name',
});
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;
```

**Validation rules**

- `review_completed: true` requires `status = 'completed'` → otherwise `409 INVALID_STATUS`.
- `review_completed: true` when `review_completed_at` is already set is a no-op: the first timestamp is kept, because it is the North Star end marker.
- `review_completed: false` sets `review_completed_at = null`.
- `file_name` is allowed in any status except `pending_upload` (`409 INVALID_STATUS`). It is the display name only; Storage paths never change.

**Response `200`:** `{ "id": "uuid", "file_name": "string", "review_completed_at": "iso | null" }`

**Errors:** `400 VALIDATION_ERROR`, `401`, `404 NOT_FOUND`, `409 INVALID_STATUS`, `429 RATE_LIMITED`.

---

## 6. Backend implementation

### 6.1 `src/server/services/contracts.service.ts`

```ts
export type ContractDetail = {
  contract: {
    id: string; file_name: string; contract_type: ContractType;
    detected_contract_type: DetectedContractType | null; type_mismatch: boolean;
    status: ContractStatus; processing_stage: ProcessingStage | null; page_count: number | null;
    created_at: string; review_completed_at: string | null; prompt_version: string | null;
    processing_attempts: number; // RetryButton hides itself at MAX_PROCESSING_ATTEMPTS (05 §8)
    contract_text: string | null; error: { code: string; message: string } | null;
  };
  pdf_url: string | null;
  pdf_url_expires_at: string | null;
  key_terms: KeyTerm[];
  custom_terms: { id: string; term_name: string }[];
  feedback: { rating: 'up' | 'down'; comment: string | null; accuracy_rating: 'yes' | 'partially' | 'no' | null } | null;
};

export async function getContractDetail(
  supabase: SupabaseClient<Database>, userId: string, contractId: string, log: Logger,
): Promise<ContractDetail | null>;

export async function applyProcessingTimeout(
  contract: { id: string; user_id: string; status: ContractStatus; processing_started_at: string | null },
): Promise<{ status: ContractStatus; error_code: string | null; error_message: string | null } | null>;

export async function updateContract(
  supabase: SupabaseClient<Database>, contractId: string, input: ContractUpdateInput,
): Promise<{ id: string; file_name: string; review_completed_at: string | null }>;
```

**`getContractDetail` steps**

1. `select … from contracts where id = contractId` (user client, §3). Returns `null` if no row.
2. If `status === 'processing'`, `const t = await applyProcessingTimeout(row)`. If it returns non-null, merge `status`, `error_code` and `error_message` into the row.
3. `await supabase.from('contracts').update({ last_accessed_at: new Date().toISOString() }).eq('id', contractId)`. On error: `log.warn('TOUCH_FAILED', …)` and continue.
4. If `status === 'completed'`, run these in parallel with `Promise.all`:
   - Key terms query (§3).
   - Custom terms query.
   - Feedback query.
   - The signed URL, if `file_path`. First assert `file_path.startsWith(`${userId}/${contractId}/`)`. If that fails: `log.error('FILE_PATH_MISMATCH')` and `pdf_url = null`. Otherwise call `createSignedUrl`. On error: `log.warn('SIGNED_URL_FAILED')` and `pdf_url = null`.
   - `pdf_url_expires_at = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()`, computed **before** the signing call so the client-side estimate is never late.
5. Otherwise run only the custom terms query; `key_terms = []`, `feedback = null`, `pdf_url = null`.
6. Map `error_code` / `error_message` → `contract.error` when `status === 'error'`. Never return `file_path` or `user_id` to the client.

**`applyProcessingTimeout`.** `05-key-term-extraction.md` is canonical if it restates this. Returns `null` immediately unless `status === 'processing'` and `processing_started_at` is more than `PROCESSING_TIMEOUT_MS` ago. Otherwise it runs the admin `update … returning` in §3, filtered by `id`, `user_id` and `status = 'processing'` (idempotent under races; 0 rows → re-read with admin and return the current status). `error_message` comes from README §4 (`PROCESSING_TIMEOUT` row).

**`updateContract` steps**

1. Load `status, review_completed_at` with the user client → `NotFoundError` if missing.
2. Apply the validation rules in §5.2.
3. Build the patch: `review_completed === true && !review_completed_at` → `{ review_completed_at: now }`; `false` → `{ review_completed_at: null }`; `file_name` → `{ file_name }`. An empty patch (no-op) skips the update and returns the current values.
4. `update(patch).eq('id', contractId).select('id, file_name, review_completed_at').single()`.

### 6.2 Route handler — `src/app/api/contracts/[id]/route.ts`

```ts
export const runtime = 'nodejs';

export const GET = withApiHandler<{ id: string }>(async (_req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, ContractIdParamsSchema); // wraps parseParams; ValidationError → NotFoundError
  const detail = await getContractDetail(supabase, user.id, id, log.child({ contract_id: id, user_id: user.id }));
  if (!detail) throw appError('NOT_FOUND');
  return Response.json(detail);
});

export const PATCH = withApiHandler<{ id: string }>(async (req, { params }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, ContractIdParamsSchema);
  await enforceRateLimit(user.id, 'edit');
  const input = await parseBody(req, ContractUpdateSchema);
  return Response.json(await updateContract(supabase, id, input));
});
```

`parseParamsOr404` lives in `src/lib/api/parse.ts` next to `parseParams`. Specs 08, 09, 11 and 13 reuse it.

### 6.3 Page — `src/app/(app)/contracts/[id]/page.tsx` (Server Component)

```tsx
export default async function ContractPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound();
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/contracts/${params.id}`);
  const detail = await getContractDetail(supabase, user.id, params.id, logger.child({ contract_id: params.id }));
  if (!detail) notFound();
  return <ContractView contractId={params.id} initialData={detail} />;
}
export const dynamic = 'force-dynamic';
```

`loading.tsx` renders `ResultsSkeleton` (header bar, a 60/40 two-panel skeleton, 6 term-row skeletons). `error.tsx` renders the generic route error card with "Try again" (`reset()`). `not-found.tsx` renders "We couldn't find that contract." and a "Back to dashboard" link.

---

## 7. State management

### 7.1 `useContract` — `src/hooks/useContract.ts`

```ts
export function useContract(id: string, initialData?: ContractDetail) {
  return useQuery({
    queryKey: qk.contract(id),
    queryFn: () => apiFetch<ContractDetail>(`/api/contracts/${id}`),
    initialData,
    initialDataUpdatedAt: Date.now(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => signedUrlRefreshDelay(query.state.data), // see 07 §6.6
  });
}
```

`apiFetch<T>(url, init?)` (`src/lib/api-client.ts`, spec 00) parses the error envelope and throws `ApiClientError { code, message, retryable, status }`.

### 7.2 `useMarkReviewComplete` — `src/hooks/useMarkReviewComplete.ts`

```ts
export function useMarkReviewComplete(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewCompleted: boolean) =>
      apiFetch<{ id: string; file_name: string; review_completed_at: string | null }>(
        `/api/contracts/${id}`, { method: 'PATCH', body: JSON.stringify({ review_completed: reviewCompleted }) }),
    onSuccess: (res) => {
      qc.setQueryData<ContractDetail>(qk.contract(id), (d) => d && ({ ...d, contract: { ...d.contract, review_completed_at: res.review_completed_at } }));
      qc.invalidateQueries({ queryKey: qk.dashboardSummary() });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}
```

Not optimistic: the button shows a spinner until the server confirms (≤ 2 s).

### 7.3 Zustand

`useResultsViewerStore` (README §3.10) is used for `goToPage`, `highlightTermId`, `activeTab` and `viewerMode`. `ContractView` calls `useResultsViewerStore.getState().reset()` on mount and on unmount, so state never leaks between contracts.

### 7.4 Local state

| Component | State |
|---|---|
| `ResultsLayout` | `compactTab: 'document' \| 'terms' \| 'chat'` (default `'terms'`), only used below 1024 px. Changing to `terms` or `chat` also calls `setActiveTab`. When the store's `scrollRequestId` changes in compact mode, it switches to `'document'` so navigation is visible |
| `TypeMismatchBanner` | `dismissed: boolean` (memory only, resets on reload) |
| `MobileLargePdfBanner` | `dismissed`, persisted in `sessionStorage['ciq.mobilePdfBanner']` |
| `KeyTermsPanel` | `selectedTermId: string \| null` (mirrors the store's `highlightTermId`) |

---

## 8. Components

### 8.1 Tree

```
ContractView ("use client"; props: contractId, initialData)
├── UploadIncompleteCard | NotAnalysedCard | ProcessingProgress (05) | ProcessingError (05)
└── ResultsLayout
    ├── ResultsHeader
    │   ├── FileTitle (H5) + ContractTypeBadge + ReviewedPill?
    │   ├── MarkReviewCompleteButton
    │   └── DeleteContractDialog (13)
    ├── LegalDisclaimer
    ├── CalibrationWarningBanner (flagged)
    ├── TypeMismatchBanner (conditional)
    ├── MobileLargePdfBanner (< 768 px only)
    ├── [≥ 1024] PanelGroup (react-resizable-panels, horizontal)
    │   ├── Panel 60% → DocumentViewer (07)
    │   ├── PanelResizeHandle
    │   └── Panel 40% → SidePanel
    └── [< 1024] Tabs: Document | Key Terms | Chat
SidePanel (Radix Tabs: "Key Terms" | "Chat", value = store.activeTab)
├── Key Terms tab → KeyTermsPanel + FeedbackWidget (11)
└── Chat tab → ChatPanel (09)
KeyTermsPanel
├── KeyTermsSummary
└── <ul> KeyTermRow × n
    ├── TermNameButton (+ CustomBadge | JargonTooltip)
    ├── ConfidenceBadge
    ├── InlineTermEditor (08) + EditedBadge (08)
    ├── PageLink
    ├── LowConfidenceWarning (score < 50)
    └── SourceSentenceDisclosure
```

**Onboarding anchors** (`14-onboarding-a11y.md`): the first `KeyTermRow`'s `ConfidenceBadge` carries `data-onboarding="confidence-badge"`, its "Why?" toggle carries `data-onboarding="why-toggle"`, and the "Chat" tab trigger carries `data-onboarding="chat-tab"`.

### 8.2 `ContractView`

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `initialData` | `ContractDetail` |

Calls `useContract(contractId, initialData)` and switches on `data.contract.status` (§2 step 2). If the query errors with `NOT_FOUND` (e.g. deleted in another tab) it calls `router.replace('/dashboard')` and shows the toast "That contract no longer exists."

### 8.3 `ResultsLayout`

| Prop | Type |
|---|---|
| `detail` | `ContractDetail` (with `status === 'completed'`) |

- **≥ 1024 px** (`lg`): `PanelGroup direction="horizontal" autoSaveId="ciq-results-split"`. Viewer panel `defaultSize={60} minSize={40} maxSize={75}`. Side panel `defaultSize={40} minSize={25}`. `PanelResizeHandle` is a 4 px wide hit area with a 1 px `--color-grey-100` line, `aria-label="Resize panels"`, and keyboard resizing with ←/→ (built into the library). Both panels have `height: calc(100dvh - <header+banners>)` and scroll independently.
- **768–1023 px**: Radix `Tabs` with triggers "Document", "Key Terms" and "Chat". Each tab panel fills the remaining viewport height.
- **< 768 px**: same tabs, plus `MobileLargePdfBanner` above them: "For the best experience with large PDFs, use a desktop browser (Chrome/Firefox)." Info style (Blue 50 background, Blue 200 border), with a close button (`aria-label="Dismiss"`).
- Breakpoint detection: `useMediaQuery('(min-width: 1024px)')` and `useMediaQuery('(min-width: 768px)')` (`src/hooks/useMediaQuery.ts`). The first client render uses CSS (`hidden lg:flex` / `lg:hidden`) so there is no layout flash.

### 8.4 `ResultsHeader`

| Prop | Type |
|---|---|
| `contract` | `ContractDetail['contract']` |

- Left: file name (H5, truncated with `title` attribute), `ContractTypeBadge` (Blue status badge with text "NDA" or "MSA"), page count ("6 pages", Paragraph Small, `--text-secondary`), and `ReviewedPill` (Green status badge "Reviewed") when `review_completed_at`.
- Right: `MarkReviewCompleteButton`.
  - Not reviewed: primary button "Mark review complete".
  - Reviewed: the pill plus a text button "Undo" (`aria-label="Mark review as not complete"`).
  - Pending: spinner and `aria-busy`.
  - On error: toast with `error.message`.
- `DeleteContractDialog` trigger (icon button `Trash2`, `aria-label="Delete contract"`).

### 8.5 `LegalDisclaimer`

No props. `<p role="note">` containing `LEGAL_DISCLAIMER` with an `Info` icon. Grey 25 surface, 1 px Grey 100 border, radius 8 px, Paragraph Small, `--text-secondary`. There is **no close control**. It renders in every `ResultsLayout` regardless of breakpoint, above both panels.

### 8.6 `TypeMismatchBanner`

| Prop | Type |
|---|---|
| `selected` | `ContractType` |
| `detected` | `DetectedContractType` |

Renders only when `contract.type_mismatch && detected && detected !== selected`. Warning pattern (Yellow 50 background, Yellow 500 border, Yellow 800 text), `AlertTriangle` icon, `role="status"`. Copy:
- `detected ∈ {nda, msa}`: "This looks like an {DETECTED} rather than an {SELECTED}. Some terms may be missing."
- `detected = other`: "This doesn't look like an {SELECTED}. Some terms may be missing."

`{X}` is uppercase "NDA" or "MSA". Dismissible (×, memory only).

### 8.7 `CalibrationWarningBanner`

No props. Renders only when `publicEnv.NEXT_PUBLIC_SHOW_CALIBRATION_WARNING === true`. Warning pattern, not dismissible. Copy: "Confidence scores are currently less reliable than usual. Please verify important terms against the document."

### 8.8 `KeyTermsPanel`

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `terms` | `KeyTerm[]` |
| `pageCount` | `number` |

- Sorts a copy by `display_order` ascending. Never re-sorts by confidence; the PRD materiality order is preserved.
- Renders `KeyTermsSummary` then `<ul aria-label="Key terms">` of `KeyTermRow`.
- `onSelect(term)`: sets `selectedTermId`. If `term.page_number !== null`, it calls `goToPage(term.page_number, { termId: term.id, text: term.source_sentence })`. If the page is null, it does not navigate and announces "This term was not found in the document" through the panel's `aria-live="polite"` region.
- Empty `terms` (should not happen for `completed`): shows the message "No key terms were extracted for this contract. Please upload it again." with a link to `/contracts/new`. There is no retry button, because `/process` rejects `completed` contracts with 409.

### 8.9 `KeyTermsSummary`

| Prop | Type |
|---|---|
| `terms` | `KeyTerm[]` |

One line, Paragraph Small: "{total} terms · {high} high · {medium} medium · {low} low confidence · {notFound} not found". Counts use `confidenceBand()`. `notFound` = `value === null`. Low count > 0 → the "{low} low confidence" segment uses Red 700 text plus the `AlertTriangle` icon (colour is never the only signal).

### 8.10 `KeyTermRow`

| Prop | Type |
|---|---|
| `term` | `KeyTerm` |
| `contractId` | `string` |
| `pageCount` | `number` |
| `isSelected` | `boolean` |
| `onSelect` | `(term: KeyTerm) => void` |

- `<li>` card: padding 12 px, radius 8 px, 1 px Grey 100 border, white background, 8 px vertical gap. Selected: 2 px `--brand` border (inset so layout doesn't shift) and `aria-current="true"`.
- **Row 1:** `TermNameButton` (Paragraph Large Medium). A `<button>` with `aria-label="Show {term_name} in the document"` that calls `onSelect`. Then `CustomBadge` (Violet status badge "Custom") when `is_custom`, or `JargonTooltip` (`HelpCircle` icon button, `aria-label="What is {term_name}?"`) showing `TERM_LIBRARY[type].find(t => t.key === term_key)?.description` when present. Right-aligned `ConfidenceBadge`.
- **Row 2:** `InlineTermEditor` (spec 08). In display mode with `value === null` it shows "Not found in document" in `--text-secondary`.
- **Row 3 (meta):** `PageLink` — a button "Page {n}" (`aria-label="Go to page {n}"`), or "No page" text when null. Then `EditedBadge` (spec 08) when `is_edited`. Then `LowConfidenceWarning` when `confidence_score < CONFIDENCE_LOW`.
- **Row 4:** `SourceSentenceDisclosure`.
- **Mouse convenience:** clicking empty card area calls `onSelect`. The handler ignores events whose target is inside `button, a, input, textarea, [data-no-row-select]`.
- The row is never hidden or collapsed because of its confidence (FR-11).

### 8.11 `ConfidenceBadge`

| Prop | Type | Default |
|---|---|---|
| `score` | `number` (0–100) | — |
| `size` | `'sm' \| 'md'` | `'md'` |

| Band (`confidenceBand`) | Range | Pattern | Icon | Visible text |
|---|---|---|---|---|
| `high` | `score ≥ 80` | Green status badge | `CheckCircle2` | `{score}%` |
| `medium` | `50 ≤ score ≤ 79` | Yellow status badge (Yellow 800 text for contrast) | `AlertCircle` | `{score}%` |
| `low` | `score < 50` | Red status badge | `AlertTriangle` | `{score}%` |

`aria-label="Confidence {score}%, {High|Medium|Low}"`. A tooltip on hover or focus: "How sure the AI is about this value. Lower scores need checking." Status badge pattern: tint 50 background, 1 px 200 border, 700 text, radius 4 px, padding 2 px 8 px, Paragraph Small Medium.

### 8.12 `LowConfidenceWarning`

| Prop | Type |
|---|---|
| `termName` | `string` |

- Always visible inline: `AlertTriangle` icon and the text "Low confidence", Red 700, Paragraph Small Medium.
- Radix Tooltip with `LOW_CONFIDENCE_TOOLTIP`. It opens on hover **and** keyboard focus (the trigger is a `<button type="button">` with `aria-describedby` pointing at a visually hidden `<span>` that always contains the full tooltip text).
- There is no dismiss control and no prop to hide it. It stays even after the user edits the term (spec 08).

### 8.13 `SourceSentenceDisclosure`

| Prop | Type |
|---|---|
| `sourceSentence` | `string \| null` |
| `sourceVerified` | `boolean` |
| `termName` | `string` |

- Radix `Collapsible`, closed by default. The trigger is a text button "Why?" with a chevron, `aria-expanded`, and `aria-controls`. Its accessible name is "Why? Show the source sentence for {termName}".
- Content:
  - `sourceSentence` present: `<blockquote>` with curly quotes, Paragraph Small, `--text-primary`, 2 px left border Grey 200, padding-left 12 px.
  - `!sourceVerified`: a Yellow status badge "Source not verified" above the quote, plus the help text "We couldn't find this exact sentence in the document, so treat this value with extra care."
  - `sourceSentence === null`: "No supporting sentence was found in the document."
- The quote text is selectable. It is not editable.

### 8.14 States

| State | Rendering |
|---|---|
| Loading (route) | `loading.tsx` → `ResultsSkeleton` |
| Loading (refetch) | Background refetch, no spinner. Existing data stays |
| Empty | §8.8 empty terms; `NotAnalysedCard`; `UploadIncompleteCard` |
| Error | `error.tsx`; `ProcessingError` (05); mutation toasts |
| Success | "Reviewed" pill; toast "Marked as reviewed" |

---

## 9. Design

| Element | Tokens |
|---|---|
| Page background | `--bg-surface` (Grey 25) |
| Panels and cards | `--bg-primary` (white), 1 px `--color-grey-100` border, radius 8 px. No shadow (flat depth) |
| Header | Padding 16 px 24 px; title H5 (24/32 500); meta Paragraph Small (12/18 400) `--text-secondary` |
| Section gaps | 24 px between header, banners and panels; 8 px between term rows; 4 px inside the badge row |
| Body text | Paragraph Large (16/24 500) `--text-primary` for values |
| Links and focus | `--brand` (Blue 500). Focus ring 2 px Blue 500, offset 2 px, 100 ms ease-out |
| Status badges | Green / Yellow / Red / Blue / Violet status badge pattern (`docs/design.md` "Semantic Status Badge") |
| Banners | Warning: Yellow 50 / Yellow 500 / Yellow 800. Info: Blue 50 / Blue 200 / Grey 900 |
| Motion | Collapsible 150 ms ease-out. Tab switch 0 ms. Respect `prefers-reduced-motion` |
| Spacing | All multiples of 4 px |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| ID is not a UUID | `notFound()` (page) / 404 (API) |
| Contract belongs to another user | RLS returns no row → 404. No information leak |
| `status = 'processing'` for more than 120 s | GET applies the timeout → renders `ProcessingError` with `PROCESSING_TIMEOUT` |
| Two tabs apply the timeout at once | Admin update filtered on `status='processing'`: one succeeds, the other updates 0 rows, re-reads and returns `error` |
| `file_path` null (90-day deletion) | `pdf_url: null` → viewer opens in text mode (07). No download link |
| `createSignedUrl` fails (Storage outage) | `pdf_url: null`, warn log. Page renders with the text viewer |
| `file_path` doesn't start with `{user_id}/{id}/` | `pdf_url: null`, error log `FILE_PATH_MISMATCH`. No Storage call |
| `last_accessed_at` update fails | Warn log. The response still succeeds |
| Term `value = null` | "Not found in document". Confidence shown. Page "No page". Editable |
| Term `page_number = null` with a value | No navigation on select. The aria-live message explains |
| `confidence_score` exactly 80 / 79 / 50 / 49 | high / medium / medium / low |
| `source_verified = false` | "Source not verified" badge inside "Why?". Confidence is already ≤ 49 from post-processing, so ⚠️ also shows |
| `type_mismatch` with `detected = other` | "This doesn't look like an NDA…" copy |
| Very long values (≤ 2,000 chars) | Value wraps (`overflow-wrap: anywhere`). The row grows; no truncation |
| Very long file name | Truncated with an ellipsis and a `title` tooltip |
| "Mark review complete" double-click | Button disabled while pending. The server keeps the first timestamp |
| Mark complete on a non-completed contract (API) | 409 `INVALID_STATUS` |
| Contract deleted in another tab | Next query → 404 → redirect to `/dashboard` and a toast |
| Viewport resized across 1024 px | Layout switches. Store state (page, highlight) is kept |

---

## 11. Acceptance criteria

- [ ] `/contracts/{id}` renders the correct view for each of the 5 statuses.
- [ ] `GET /api/contracts/{id}` returns exactly the §5.1 shape, never includes `file_path` or `user_id`, and returns 404 for another user's contract.
- [ ] `pdf_url` is a signed URL valid for 3,600 s. A Storage failure gives `pdf_url: null` and HTTP 200.
- [ ] Every page load updates `contracts.last_accessed_at`.
- [ ] Each term shows Term Name, Extracted Value (or "Not found in document"), Page Number and Confidence Score % (FR-04).
- [ ] Confidence colours: green ≥ 80, amber 50–79, red < 50. Each band also has a distinct icon and visible % text.
- [ ] Every term with a score under 50 shows ⚠️ "Low confidence" with the exact tooltip text. It cannot be dismissed, and the term is never hidden (FR-11).
- [ ] "Why?" shows the verbatim `source_sentence`, with "Source not verified" when `source_verified = false`.
- [ ] Clicking a term or its page link calls `goToPage` with the term's page and source sentence (US-003). The viewer scrolls (verified in 07).
- [ ] `LEGAL_DISCLAIMER` is visible on every results view at every breakpoint and has no close control.
- [ ] The type-mismatch banner appears only when `type_mismatch` is true. The calibration banner appears only when the env flag is true.
- [ ] ≥ 1024 px shows two resizable panels defaulting to 60/40. 768–1023 px shows tabs. < 768 px shows tabs and the mobile banner.
- [ ] "Mark review complete" sets `review_completed_at` (kept on repeat) and "Undo" clears it. The dashboard summary is invalidated.
- [ ] axe reports 0 serious or critical violations on the results page.

---

## 12. Tests

**Unit (Vitest + RTL)**
- `confidenceBand`: 0, 49 → low; 50, 79 → medium; 80, 100 → high.
- `ConfidenceBadge`: renders the % text, icon and aria-label per band.
- `LowConfidenceWarning`: rendered for score 49, not for 50. No element with role `button` named "Dismiss"/"Close". Tooltip text is present in the DOM (`aria-describedby`).
- `KeyTermRow`: null value → "Not found in document". Clicking the term name calls `onSelect`. Clicking inside the editor does not. Custom badge vs jargon tooltip.
- `SourceSentenceDisclosure`: collapsed by default. The expanded state shows the quote. The unverified badge. The null-sentence copy.
- `KeyTermsPanel`: sorts by `display_order`. Null page → no `goToPage` call and an aria-live message.
- `TypeMismatchBanner`: both copy variants. Hidden when `type_mismatch = false`.
- `ResultsLayout`: with mocked `matchMedia`, renders the PanelGroup at 1200 px, tabs at 900 px, tabs + banner at 375 px.

**Integration (local Supabase + route handlers)**
- GET as owner → 200 with terms ordered by `display_order`. As another user → 404. Malformed id → 404.
- GET on a `processing` contract with `processing_started_at = now() - 3 min` → `status: 'error'`, `error.code = 'PROCESSING_TIMEOUT'`. The DB row is updated.
- GET with the Storage object missing → `pdf_url: null`, 200.
- GET updates `last_accessed_at` (before < after).
- PATCH `review_completed: true` twice → the same `review_completed_at`. `false` → null. On a `ready` contract → 409. Empty body → 400. Exceeding the `edit` limit → 429.
- PATCH `file_name` with 256 chars → 400.

**E2E (Playwright)**
- `contract-review.spec.ts` (shared with 03/05): results show 10 standard terms + custom terms. Click a term → viewer page changes. Expand "Why?". Mark review complete → "Reviewed" pill. Reload keeps it.
- `low-confidence.spec.ts`: mocked extraction with a 35% term → ⚠️ visible, tooltip text on focus, term still listed.
- `a11y.spec.ts`: axe on `/contracts/{id}` at 1280 px and 375 px.
