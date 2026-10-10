# 16 — Export Key Terms (CSV & PDF Report)

> **Phase 2 (v1.1) — not part of the MVP.** Build this after every MVP spec (00–15) has shipped. The API is designed in engineering-doc §9.9 and the feature is listed in §10.2.

## 1. Overview

**Builds:** `GET /api/contracts/{id}/export?format=csv|pdf`, the server-side `buildCsv` and `buildPdfReport` functions, a reusable `toCsv` helper, and an `ExportMenu` in `ResultsHeader`. Users can download a contract's key terms as a CSV spreadsheet or a formatted PDF summary to share with their team.

**References:**
- PRD: US-011 ("Export button generates a formatted file within 5 seconds and downloads to the browser"), roadmap v1.1.
- Engineering doc: §2.3, §9.9, §10.2, §14 (`16-export.md` row).

**Depends on:** `06-results-key-terms-panel.md` (`ResultsHeader`, key-term data), `08-inline-editing.md` (edited and original values), `00-foundation.md` (API wrapper, design tokens).

**Performance target:** response fully sent in **≤ 5 s** at P95 for a contract with 17 terms (12 MSA + 5 custom, the maximum).

---

## 2. User flow

1. On the results page (`status = 'completed'`), the user opens **Export** (`ExportMenu`, a `Download` icon button) in `ResultsHeader`.
2. The menu offers **Export CSV** and **Export PDF report**.
3. The user picks one. The menu item shows a spinner and the trigger shows `aria-busy`.
4. The browser fetches `GET /api/contracts/{id}/export?format=…`, receives the file as a blob, and triggers the download with the server-provided file name.
5. Toast "Export ready". On error, a toast shows the catalog message.

---

## 3. Database

| Operation | Client | Query |
|---|---|---|
| Load the contract | user (`createServerSupabase`, RLS) | `from('contracts').select('id, file_name, contract_type, detected_contract_type, type_mismatch, status, page_count, prompt_version, created_at, processing_completed_at, review_completed_at').eq('id', id).maybeSingle()` |
| Load the key terms | user | `from('key_terms').select('term_key, term_name, is_custom, value, page_number, confidence_score, source_sentence, source_verified, is_edited, original_value, original_page_number, edited_at, display_order').eq('contract_id', id).order('display_order')` |

Read-only. No service-role use.

---

## 4. Database tasks

**None.** It uses existing tables and RLS (`contracts_select_own`, `key_terms_select_own`).

---

## 5. API routes

### `GET /api/contracts/{id}/export`

| Field | Value |
|---|---|
| File | `src/app/api/contracts/[id]/export/route.ts` (`export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`) |
| Purpose | Download key terms as CSV or as a PDF summary report |
| Auth | Required (`requireUser`) |
| Rate limit | None. No AI cost, and the request is bounded by one contract's rows |
| Params | `id: z.string().uuid()` |
| Query | `ExportQuerySchema = z.object({ format: z.enum(['csv', 'pdf']) })` (`src/lib/validation/export.ts`) |
| Preconditions | Contract exists and is owned by the caller (else `404 NOT_FOUND`). `status = 'completed'` (else `409 INVALID_STATUS`) |
| Response `200` CSV | Body: CSV bytes. Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<base>-key-terms.csv"; filename*=UTF-8''<encoded>`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` |
| Response `200` PDF | Body: PDF bytes. Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<base>-contractiq-report.pdf"; filename*=UTF-8''<encoded>`, `Cache-Control: no-store` |
| Errors | `400 VALIDATION_ERROR` (bad id or format), `401 UNAUTHORIZED`, `404 NOT_FOUND`, `409 INVALID_STATUS`, `500 INTERNAL_ERROR` |

**File name base:** `<base> = safeFileName(contract.file_name).replace(/\.pdf$/, '')`. For example `Acme Mutual NDA (final).pdf` → `acme_mutual_nda_final`. `filename=` carries the ASCII-safe base. `filename*=` carries `encodeURIComponent` of the same string.

---

## 6. Backend implementation

### 6.1 Files

| File | Responsibility |
|---|---|
| `src/lib/csv.ts` | `toCsv(header, rows)` and `escapeCsvCell` — generic, no `server-only`, so `evals/` reuses it (`15-evals.md` §6.10) |
| `src/server/services/export.service.ts` | `getExportData`, `buildCsv`, `buildPdfReport` |
| `src/server/export/ContractReport.tsx` | `@react-pdf/renderer` document component |
| `src/server/export/pdf-theme.ts` | Colours, sizes and spacing for the PDF, as hex/pt values mirrored from `docs/design.md` |
| `src/server/export/fonts/InterDisplay-Regular.ttf`, `InterDisplay-Medium.ttf` | Font files registered with `Font.register` |
| `src/app/api/contracts/[id]/export/route.ts` | Thin handler |
| `src/components/contracts/ExportMenu.tsx` | UI |
| `src/hooks/useExportContract.ts` | Fetch, then a blob download |

**Dependency:** `@react-pdf/renderer` `^4`. Add it to `next.config.mjs` → `experimental.serverComponentsExternalPackages: ['pdf-parse', '@react-pdf/renderer']`. Add the `.ttf` files to the Netlify function bundle: `netlify.toml` → `[functions] included_files = ["src/server/export/fonts/**"]`.

### 6.2 `src/lib/csv.ts`

```ts
const INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (INJECTION_PREFIX.test(s)) s = `'${s}`;                       // CSV-injection guard (OWASP)
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;         // RFC 4180 quoting
  return s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [header, ...rows].map(r => r.map(escapeCsvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';                      // BOM for Excel, CRLF per RFC 4180
}
```

The guard also applies to negative numbers stored as text (`-5%` → `'-5%`). This is intended: the cell shows the literal text instead of evaluating it as a formula.

### 6.3 `export.service.ts`

```ts
export type ExportData = { contract: ExportContract; terms: ExportTerm[] };

export async function getExportData(supabase: SupabaseClient<Database>, contractId: string): Promise<ExportData> {
  // contract query (§3) → null → NOT_FOUND; status !== 'completed' → INVALID_STATUS
  // terms query (§3) → error → INTERNAL_ERROR
}

export const CSV_HEADER = ['Term', 'Value', 'Page', 'Confidence (%)', 'Edited', 'Original AI Value', 'Source Sentence'];

export function buildCsv({ terms }: ExportData): string {
  return toCsv(CSV_HEADER, terms.map(t => [
    t.is_custom ? `${t.term_name} (Custom)` : t.term_name,
    t.value ?? 'Not found in document',
    t.page_number ?? '',
    t.confidence_score,
    t.is_edited ? 'Yes' : 'No',
    t.is_edited ? (t.original_value ?? 'Not found in document') : '',
    t.source_sentence ?? '',
  ]));
}

export async function buildPdfReport(data: ExportData, generatedAt: Date): Promise<Buffer> {
  return renderToBuffer(<ContractReport data={data} generatedAt={generatedAt} />);   // @react-pdf/renderer
}
```

The route handler:

```ts
export const GET = withApiHandler<{ id: string }>(async (req, ctx) => {
  const { supabase } = await requireUser();
  const { id } = parseParams(ctx.params, IdParamsSchema);
  const { format } = parseQuery(req, ExportQuerySchema);
  const data = await getExportData(supabase, id);
  const base = safeFileName(data.contract.file_name).replace(/\.pdf$/, '');
  const started = Date.now();
  const body = format === 'csv' ? buildCsv(data) : await buildPdfReport(data, new Date());
  ctx.log.info('contract_exported', { contract_id: id, format, ms: Date.now() - started });
  const filename = format === 'csv' ? `${base}-key-terms.csv` : `${base}-contractiq-report.pdf`;
  return new Response(body, { status: 200, headers: {
    'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'X-Content-Type-Options': 'nosniff',
  }});
});
```

### 6.4 PDF report layout — `ContractReport.tsx`

A4 portrait, 40 pt margins, Inter Display (Regular 400, Medium 500). Every visible string is real text, so the PDF is searchable and copyable.

| Section | Content |
|---|---|
| **Header** (page 1) | "ContractIQ — Key Terms Report" (18 pt, Medium). File name. Type badge ("NDA" or "MSA"). "{page_count} pages". "Analysed {processing_completed_at, 'd MMM yyyy'}". "Generated {generatedAt, 'd MMM yyyy HH:mm'} UTC". "Reviewed" when `review_completed_at` is set |
| **Disclaimer box** (page 1, right after the header) | `LEGAL_DISCLAIMER`, verbatim. Grey 25 fill, Grey 100 border, 10 pt. Must appear **before** any extracted value |
| **Type mismatch note** (only when `type_mismatch`) | "This document looks like a {detected} rather than an {selected}. Some terms may be missing." Yellow 50 fill, Yellow 800 text |
| **Summary** | Counts: total terms, high confidence (≥ 80), medium (50–79), low (< 50), not found (value null), edited. Shown as a 6-cell labelled row |
| **Key terms table** | Columns: Term (25%) · Value (43%) · Page (8%) · Confidence (14%) · Status (10%). Confidence cell: `{score}%` plus a band label in words, "High", "Medium" or "Low", coloured Green 700, Yellow 800 or Red 600 (the text label makes it readable without colour). Low (< 50) rows add "⚠ Verify in document" in the Status cell. Edited rows show "Edited" in Status, with "Original: {original_value}" in 8 pt Grey 500 under the value. Custom terms get "(Custom)" after the name. Null value → "Not found in document" in Grey 500 italic. Rows don't break across pages (`wrap={false}`), and the header row repeats (`fixed`) |
| **Source sentences appendix** ("Why? — Source sentences") | One block per term with a non-null `source_sentence`: the term name (Medium), "Page {n}", the sentence in quotes, and "(Source not verified in document text)" when `!source_verified` |
| **Footer** (every page, `fixed`) | Left: "AI-assisted review — not legal advice". Centre: "Powered by OpenAI GPT-4o". Right: "Page {pageNumber} of {totalPages}" |

`pdf-theme.ts` holds the hex values copied from `docs/design.md` with their token names noted:
- text primary Grey 900 `#070A0E`, text secondary Grey 500 `#4A4C4F`
- surface Grey 25 `#FAFAFA`, border Grey 100 `#DADADB`, brand Blue 500 `#115ACB`
- Green 700 `#0D720A`, Yellow 800 `#B36800`, Yellow 50 `#FFF9F0`, Red 600 `#BE2F33`

PDFs can't use CSS variables. This file is the only place the PDF defines colours, and a unit test checks that its values match `src/styles/tokens.css`.

---

## 7. State management

`useExportContract(contractId)` — `useMutation`:

```ts
mutationFn: async (format: 'csv' | 'pdf') => {
  const res = await fetch(`/api/contracts/${contractId}/export?format=${format}`);
  if (!res.ok) throw await toApiError(res);             // shared helper from 00-foundation
  const blob = await res.blob();
  const filename = parseContentDispositionFilename(res.headers.get('Content-Disposition'))
    ?? `contract-${format === 'csv' ? 'key-terms.csv' : 'report.pdf'}`;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

`parseContentDispositionFilename` lives in `src/lib/utils.ts`. It prefers `filename*=UTF-8''…` and falls back to `filename="…"`. No query cache is involved: exports are not cached.

---

## 8. Components

### `ExportMenu` (`src/components/contracts/ExportMenu.tsx`, client)

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `disabled?` | `boolean` (true when `status !== 'completed'`) |

- **Trigger:** icon button (`Download`) with the visible label "Export" at ≥ 768 px and icon-only below that, with `aria-label="Export key terms"` in both cases. Placed in `ResultsHeader` to the left of `MarkReviewCompleteButton`.
- **Menu (Radix DropdownMenu):** "Export CSV" (`FileSpreadsheet` icon) and "Export PDF report" (`FileText` icon).
- **States:**
  - idle;
  - pending: the chosen item shows a spinner, both items are disabled, the trigger has `aria-busy="true"`, and the menu stays open until the download starts;
  - success: the menu closes and the toast "Export ready" appears;
  - error: toast with the catalog message (e.g. `INVALID_STATUS` → "This contract isn't ready for that action yet.").
- **Keyboard:** standard Radix menu (arrows, Enter, Esc). Focus returns to the trigger.

**Integration:** `06-results-key-terms-panel.md` §8.4 `ResultsHeader` gets `<ExportMenu contractId={contract.id} disabled={contract.status !== 'completed'} />` in v1.1.

---

## 9. Design

| Element | Tokens |
|---|---|
| Trigger | Secondary (outline) button: Grey 100 border, `text-primary`, design-system radius, `space-2`/`space-3` padding. Focus ring Primary Blue ★500 |
| Menu | `bg-primary` surface, Grey 100 border, design-system elevation, Paragraph Large / Medium (16/24, 500) items, `space-2` item padding. Hover `bg-subtle` (Grey 50) |
| Toasts | Success: Green ★500 icon on Green 50. Error: Red ★500 on Red 50 |
| PDF | `pdf-theme.ts` values (§6.4), mirroring the design-system tokens. Inter Display only |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Contract not `completed` (`processing`, `error`, `ready`) | `409 INVALID_STATUS`. The menu is disabled in the UI anyway |
| Another user's contract | `404 NOT_FOUND` |
| `format` missing or `xlsx` | `400 VALIDATION_ERROR` |
| A term value starting with `=`, `+`, `-`, `@`, tab or CR (e.g. `=HYPERLINK(...)` placed in a contract) | The cell is prefixed with `'`, so spreadsheet apps show the text instead of running a formula |
| A value with commas, quotes or newlines | Quoted per RFC 4180, with `"` doubled. The row stays one record |
| Null value | CSV "Not found in document". PDF the same, in grey italic |
| Edited term whose original AI value was null | `Original AI Value` = "Not found in document" |
| Non-ASCII file name (`Contrat de confidentialité.pdf`) | `filename="contrat_de_confidentialit.pdf…"` (slugified ASCII) plus `filename*=UTF-8''…` |
| Very long value or sentence (2,000 chars) | PDF: text wraps and the row may get tall. `wrap={false}` moves it whole to the next page. A row taller than a page falls back to `wrap` (react-pdf behaviour). Logged, not an error |
| PDF render throws | `500 INTERNAL_ERROR`, logged with `contract_id`. The CSV export still works |
| Export after the 90-day PDF deletion | Works: export uses DB rows only, not the PDF |
| Two exports clicked quickly | The second is ignored while the first is pending (items disabled) |

---

## 11. Acceptance criteria

- [ ] **Export CSV** downloads `<base>-key-terms.csv` in ≤ 5 s. It opens in Excel and Google Sheets with columns `Term, Value, Page, Confidence (%), Edited, Original AI Value, Source Sentence`, one row per key term in display order, with UTF-8 characters intact.
- [ ] Every cell starting with `= + - @`, tab or CR is prefixed with `'`. Every field containing `,`, `"`, CR or LF is quoted.
- [ ] **Export PDF report** downloads `<base>-contractiq-report.pdf` in ≤ 5 s. It contains the header, the legal disclaimer before any extracted value, the summary counts, the full key-terms table with confidence shown in words and numbers, the source-sentence appendix, and a footer with page numbers and "Powered by OpenAI GPT-4o".
- [ ] Edited terms show "Edited" and their original AI value in both formats.
- [ ] Non-completed contracts get `409`. Other users' contracts get `404`. Unauthenticated callers get `401`.
- [ ] `ExportMenu` is keyboard-operable, announces the busy state, and passes axe with 0 serious or critical violations.

---

## 12. Tests

### Unit

| File | Cases |
|---|---|
| `lib/csv.test.ts` | BOM present. CRLF endings. Comma/quote/newline quoting. Doubled quotes. Injection prefixes for `=`, `+`, `-`, `@`, `\t`, `\r`. Null/undefined → empty. Numbers unquoted |
| `server/services/export.service.test.ts` | `buildCsv` header exact. Custom suffix. Null value text. Edited/original columns. Display order kept. `getExportData` → `NOT_FOUND` / `INVALID_STATUS` |
| `server/export/ContractReport.test.ts` | `buildPdfReport` on a 17-term fixture returns a buffer starting with `%PDF-`. Text extracted with `pdf-parse` contains `LEGAL_DISCLAIMER`, every term name, "Page 1 of" and "Powered by OpenAI GPT-4o". The disclaimer's index in the text is lower than the first term value's index. Render time < 2 s |
| `server/export/pdf-theme.test.ts` | Every hex in `pdf-theme.ts` equals the matching CSS variable in `src/styles/tokens.css` |
| `lib/utils.test.ts` | `parseContentDispositionFilename` handles `filename*` UTF-8, `filename` only, and a missing header |

### Integration

| File | Cases |
|---|---|
| `api/contracts-export.test.ts` | Seeded completed contract: CSV `200`, `text/csv; charset=utf-8`, attachment file name, body parses back to 17 rows. PDF `200`, `application/pdf`, starts with `%PDF-`. `format=xlsx` → `400`. `processing` contract → `409`. User B → `404`. No session → `401`. CSV and PDF each respond in < 5 s |

### E2E

| Spec | Flow |
|---|---|
| `export.spec.ts` | Completed contract fixture → Export → CSV → Playwright `download` event, `suggestedFilename()` ends in `-key-terms.csv`, the file contains the term names → Export → PDF report → download ends in `-contractiq-report.pdf` and the file size is > 1 KB |
