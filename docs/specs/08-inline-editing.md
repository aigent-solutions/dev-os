# 08 — Inline Key Term Editing

## 1. Overview

**Builds:** inline correction of an extracted term's value (and optionally its page number) from the key terms panel.
- `PATCH /api/key-terms/{id}` and the `updateKeyTerm` service.
- `InlineTermEditor`, `EditedBadge` (with "Restore AI value") and the optimistic `useUpdateKeyTerm` hook.
- How corrections reach the `term_corrections` view for the improvement loop.

**References:** engineering-doc §4.3 step 11, §7.6 (`key_terms`, column grants, `preserve_original_term_value`), §7.12 (`term_corrections`), §9.3. PRD US-009 (saves within 2 s, "Edited" badge, original AI value stored separately), §8 prompt improvement plan, §10 correction-rate metric.

**Depends on:** `06-results-key-terms-panel.md` (`KeyTermRow` hosts these components; `useContract` cache), `12-rate-limiting-usage.md` (`edit` bucket), `supabase-schema.sql`.

---

## 2. User flow

1. In a `KeyTermRow`, the user clicks the value (or focuses it and presses Enter/Space). The display button becomes an editor: a textarea pre-filled with the current value (empty if "Not found in document"), plus a "Page" number input pre-filled with `page_number`.
2. The user edits. `Enter` saves, `Shift+Enter` inserts a newline, `Esc` cancels, and moving focus out of the editor saves (if changed and valid) or cancels (if unchanged).
3. On save the UI updates immediately (optimistic): new value, "Edited" badge, original stored in the cache. `PATCH /api/key-terms/{id}` runs in the background.
4. On success the cache row is replaced with the server row. A visually hidden live region announces "Saved".
5. On failure the row reverts and a toast shows the error message with a "Retry" action that re-opens the editor holding the attempted value.
6. Hovering or focusing "Edited" shows "Original AI value: …" (and "Original page: N"). If the original value exists, a "Restore AI value" button PATCHes it back.

---

## 3. Database

| Operation | Table | Client | Query |
|---|---|---|---|
| Load term with parent | `key_terms` + `contracts` | user | `select id, contract_id, value, page_number, contracts!inner(status, page_count) from key_terms where id = $1` → `.maybeSingle()` |
| Update | `key_terms` | user | `update key_terms set value = $2[, page_number = $3] where id = $1 returning id, value, page_number, is_edited, original_value, original_page_number, edited_at` |

Database rules this spec relies on (all in `supabase-schema.sql`):

- **Column privileges:** `authenticated` may update **only** `value` and `page_number` (`grant update (value, page_number) on key_terms`). Any other column in the `SET` list fails with `42501 permission denied`.
- **RLS:** `key_terms_update_own` → `user_id = auth.uid()`. Another user's term updates 0 rows and the service returns 404.
- **Trigger `preserve_original_term_value`** (BEFORE UPDATE): when `value` or `page_number` changes:
  - if `old.original_value is null and not old.is_edited`, it copies `old.value → original_value` and `old.page_number → original_page_number`;
  - it always sets `is_edited = true` and `edited_at = now()`.
  - So originals are captured **once** (the first AI value), and `edited_at` tracks the latest edit.
- **Trigger `set_updated_at`** bumps `updated_at`.
- **Constraint** `key_terms_page_number_min` (≥ 1).
- **View `term_corrections`** (`security_invoker`) lists every `is_edited` row with `original_value`, `corrected_value`, `original_page_number`, `page_number`, `confidence_score` and `edited_at`. Users can only see their own rows. It is not exposed through any API in the MVP.

---

## 4. Database tasks

None new. Verify these exist in `supabase-schema.sql`: `revoke update on key_terms from authenticated` followed by `grant update (value, page_number)`; trigger `trg_key_terms_preserve_original`; view `term_corrections`; index `idx_key_terms_edited`.

**Ops queries** (documented for the prompt-review process and run with the service role in the SQL editor):

```sql
-- Corrections in the last 7 days, most-corrected terms first
select term_key, count(*) as corrections
from term_corrections
where edited_at > now() - interval '7 days'
group by term_key order by corrections desc;

-- Rolling correction rate (alert above 0.12, see 12-rate-limiting-usage.md)
select * from term_correction_rate_7d;

-- Opt-in, anonymised corrections for prompt improvement
select * from term_corrections_anonymised order by edited_at desc limit 200;
```

---

## 5. API routes

### `PATCH /api/key-terms/{id}`

File: `src/app/api/key-terms/[id]/route.ts`. `export const runtime = 'nodejs'`.

| Field | Value |
|---|---|
| Auth | Required (`requireUser`) |
| Rate limit | `edit` — 120 requests / 60 s per user |
| Params | `KeyTermIdParamsSchema = z.object({ id: z.string().uuid() })`. Invalid → 404 `NOT_FOUND` (`parseParamsOr404`) |
| Body | `KeyTermUpdateSchema` |

```ts
// src/lib/validation/key-term.ts
export const KeyTermUpdateSchema = z.object({
  value: z.string().trim()
    .min(1, "Value can't be empty")
    .max(MAX_TERM_VALUE_CHARS, `Value must be ${MAX_TERM_VALUE_CHARS} characters or fewer`),
  page_number: z.number().int().min(1, 'Page must be 1 or higher').max(MAX_PAGES).nullable().optional(),
}).strict();
export type KeyTermUpdateInput = z.infer<typeof KeyTermUpdateSchema>;
```

**Validation rules**

1. `value` is required, trimmed, 1–2,000 chars. Users cannot clear a value back to null; "Not found" can only come from the AI.
2. `page_number`: omitted → unchanged; `null` → cleared; integer → must be ≤ the parent `contracts.page_count`, otherwise `400 VALIDATION_ERROR` with `details.page_number = "Page must be between 1 and {page_count}"`.
3. Parent contract `status` must be `completed`, otherwise `409 INVALID_STATUS`.
4. Unknown keys → 400 (`.strict()`).

**Response `200`**

```json
{
  "id": "uuid",
  "value": "Laws of England and Wales",
  "page_number": 5,
  "is_edited": true,
  "original_value": "Laws of the State of New York",
  "original_page_number": 5,
  "edited_at": "2026-10-09T10:12:03.120Z"
}
```

**Errors:** `400 VALIDATION_ERROR` (with field `details`), `401 UNAUTHORIZED`, `404 NOT_FOUND` (missing, malformed or not owned), `409 INVALID_STATUS`, `429 RATE_LIMITED` (+ `Retry-After`), `500 INTERNAL_ERROR`.

**Latency:** P95 ≤ 2 s end to end (US-009). Server target ≤ 500 ms: one read and one update, both by primary key.

---

## 6. Backend implementation

### 6.1 Route handler

```ts
export const runtime = 'nodejs';

export const PATCH = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, KeyTermIdParamsSchema);
  await enforceRateLimit(user.id, 'edit');
  const input = await parseBody(req, KeyTermUpdateSchema);
  const updated = await updateKeyTerm(supabase, id, input);
  log.info('key_term_updated', { user_id: user.id, key_term_id: id, page_changed: input.page_number !== undefined });
  return Response.json(updated);
});
```

Logs never include `value` (README §5, no contract content in logs).

### 6.2 `src/server/services/key-terms.service.ts`

```ts
export type KeyTermUpdateResult = Pick<KeyTerm,
  'id' | 'value' | 'page_number' | 'is_edited' | 'original_value' | 'original_page_number' | 'edited_at'>;

export async function updateKeyTerm(
  supabase: SupabaseClient<Database>, termId: string, input: KeyTermUpdateInput,
): Promise<KeyTermUpdateResult>;
```

Steps:

1. Load (user client): `supabase.from('key_terms').select('id, contract_id, value, page_number, is_edited, original_value, original_page_number, edited_at, contracts!inner(status, page_count)').eq('id', termId).maybeSingle()`. `null` → `appError('NOT_FOUND')`.
2. `if (row.contracts.status !== 'completed') throw appError('INVALID_STATUS')`.
3. `if (input.page_number != null && input.page_number > (row.contracts.page_count ?? 0))` → throw `new ValidationError(..., { page_number: \`Page must be between 1 and ${row.contracts.page_count}\` })`.
4. Build the patch. `patch.value = input.value`. If `'page_number' in input`, `patch.page_number = input.page_number`.
5. **No-op short-circuit:** if `patch.value === row.value` and (`page_number` is absent or equal), return the current row fields without updating. This avoids marking an untouched term as edited.
6. `supabase.from('key_terms').update(patch).eq('id', termId).select('id, value, page_number, is_edited, original_value, original_page_number, edited_at').single()`.
7. A Postgres error `42501` (column privilege) means a programming error → `INTERNAL_ERROR` (logged). Zero rows (concurrent delete) → `NOT_FOUND`.

---

## 7. State management

### 7.1 `useUpdateKeyTerm` — `src/hooks/useUpdateKeyTerm.ts`

```ts
type Vars = { termId: string; value: string; page_number?: number | null };

export function useUpdateKeyTerm(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ termId, ...body }: Vars) =>
      apiFetch<KeyTermUpdateResult>(`/api/key-terms/${termId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.contract(contractId) });
      const previous = qc.getQueryData<ContractDetail>(qk.contract(contractId));
      qc.setQueryData<ContractDetail>(qk.contract(contractId), (d) => d && ({
        ...d,
        key_terms: d.key_terms.map((t) => t.id !== vars.termId ? t : applyLocalEdit(t, vars)),
      }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.contract(contractId), ctx.previous);
    },
    onSuccess: (res) => {
      qc.setQueryData<ContractDetail>(qk.contract(contractId), (d) => d && ({
        ...d, key_terms: d.key_terms.map((t) => (t.id === res.id ? { ...t, ...res } : t)),
      }));
    },
  });
}

/** Mirrors the preserve_original_term_value trigger so the optimistic state matches the server. */
export function applyLocalEdit(t: KeyTerm, v: Vars): KeyTerm {
  const pageChanged = v.page_number !== undefined && v.page_number !== t.page_number;
  if (v.value === t.value && !pageChanged) return t;
  const captureOriginal = t.original_value === null && !t.is_edited;
  return {
    ...t,
    value: v.value,
    page_number: v.page_number !== undefined ? v.page_number : t.page_number,
    is_edited: true,
    original_value: captureOriginal ? t.value : t.original_value,
    original_page_number: captureOriginal ? t.page_number : t.original_page_number,
    edited_at: new Date().toISOString(),
  };
}
```

- Does not invalidate the whole contract query, because a refetch would re-sign the URL and could reset editor state. Dashboard queries are not affected by term edits.
- Edits to **different** terms can run concurrently. Rapid edits to the **same** term are serialised in the component: the editor is disabled while `isPending` for that term.

### 7.2 Local component state (`InlineTermEditor`)

`mode: 'display' | 'editing'`, `draftValue: string`, `draftPage: string` (input text), `fieldErrors: { value?: string; page?: string }`, `isSaving: boolean` (from the mutation for this term).

---

## 8. Components

### 8.1 `InlineTermEditor` — `src/components/key-terms/InlineTermEditor.tsx`

| Prop | Type | Notes |
|---|---|---|
| `term` | `KeyTerm` | |
| `contractId` | `string` | |
| `pageCount` | `number` | Upper bound for the page input |
| `disabled` | `boolean?` | Default `false` |

**Display mode**
- `<button type="button" data-no-row-select aria-label="Edit {term_name} value">`. The content is the value (Paragraph Large, `--text-primary`, `white-space: pre-wrap`) or "Not found in document" (`--text-secondary`). A `Pencil` icon (16 px) shows on hover or focus. Activated by click, Enter or Space.

**Editing mode** (container `<div role="group" aria-label="Edit {term_name}" data-no-row-select>`)
- `<textarea>`: auto-sized (min 2 rows, max 8 rows, then scrolls). `aria-label="{term_name} value"`. `maxLength={MAX_TERM_VALUE_CHARS}`. Autofocus with the caret at the end. The character counter "{n}/2000" appears once n > 1,800.
- `<input type="number" inputMode="numeric" min=1 max={pageCount}>` labelled "Page" (visible label, Paragraph Small). An empty string means `null`.
- Buttons: "Save" (primary, small) and "Cancel" (secondary, small), always visible for touch and screen-reader users.
- Inline errors under each field (Red 700, Paragraph Small), linked with `aria-describedby` and `aria-invalid`.

**Keyboard and focus**

| Input | Action |
|---|---|
| `Enter` (textarea, no Shift) | `preventDefault`, save |
| `Shift+Enter` | Newline |
| `Enter` (page input) | Save |
| `Esc` | Cancel → back to display mode, focus returns to the display button |
| Focus leaves the editor group | Checked with `onBlur` on the group: ignore when `e.relatedTarget` is inside the group. Changed and valid → save. Unchanged → cancel. Invalid → stay in editing mode with errors shown |

**Save procedure**
1. Trim the value. Client-validate with `KeyTermUpdateSchema` plus `page ≤ pageCount`.
2. Only include `page_number` if it changed. Draft `''` → `null`.
3. Unchanged → cancel.
4. Otherwise `mutate({ termId, value, page_number? })` and switch to display mode immediately (optimistic).
5. The live region (`aria-live="polite"`, visually hidden) announces "Saved {term_name}" on success.
6. On error: toast `{error.message}` with action "Retry", which re-opens the editor with the attempted draft. Server `VALIDATION_ERROR` details map back to `fieldErrors` when the editor is re-opened.

### 8.2 `EditedBadge` — `src/components/key-terms/EditedBadge.tsx`

| Prop | Type |
|---|---|
| `term` | `KeyTerm` (rendered only when `term.is_edited`) |
| `contractId` | `string` |

- A Blue status badge with `PencilLine` icon and the text "Edited".
- It is a `<button type="button" data-no-row-select aria-haspopup="dialog">` that opens a Radix `Popover` on click, Enter or Space. A Tooltip also opens on hover or focus with the same summary.
- Popover content:
  - "Original AI value:" followed by `original_value`, or "Not found in document" if null.
  - "Original page: {original_page_number}", or "None".
  - "Edited {relative time from edited_at}" (`date-fns formatDistanceToNow`, with the absolute time in `title`).
  - A "Restore AI value" button, shown only when `original_value !== null`. It calls `useUpdateKeyTerm(contractId).mutate({ termId, value: original_value, page_number: original_page_number })`. The term stays `is_edited = true` (the trigger never un-sets it). Restoring is recorded as an edit back to the AI value, and `term_corrections` shows `corrected_value = original_value` (which the eval tooling counts as "no correction").

### 8.3 Interaction with spec 06

- `KeyTermRow` passes `term`, `contractId` and `pageCount`. Elements marked `data-no-row-select` do not trigger row navigation.
- `ConfidenceBadge` keeps showing the **AI** confidence after an edit. `LowConfidenceWarning` stays visible (it is not dismissible, see spec 06 §8.12).
- After the page number changes, the `PageLink` and future navigation use the new `page_number`. `source_sentence` is unchanged, so the highlight may fall back to a page highlight on the new page.

### 8.4 States

| State | Rendering |
|---|---|
| Saving | Display mode with new value, plus a 12 px spinner next to the value, `aria-busy="true"` on the row. Editor re-open disabled |
| Error | Reverted value, toast with "Retry" |
| Success | "Edited" badge. Live region announcement |

---

## 9. Design

| Element | Tokens |
|---|---|
| Display button | No border. Hover background Grey 50, radius 6 px, padding 4 px 8px (−8 px horizontal margin so the text aligns) |
| Textarea / input | White, 1 px Grey 100 border, radius 6 px, padding 8 px 12 px, Paragraph Large. Focus: 2 px Blue 500 border (100 ms ease-out). Error: Red 500 border, Red 50 background, Red 700 message |
| Buttons | Primary: `--brand` background, white text, radius 6 px, height 32 px. Secondary: white, 1 px Grey 100 border |
| Edited badge | Blue status badge (Blue 50 / Blue 200 / Blue 700, radius 4 px, 2 px 8 px, Paragraph Small Medium) |
| Popover | White, 1 px Grey 100 border, radius 8 px, padding 12 px, max-width 320 px. Enter 150 ms ease-out |
| Spacing | 8 px between textarea, page input and buttons |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Value unchanged on blur or Enter | Cancel. No request. `is_edited` stays false |
| Value only whitespace | Client error "Value can't be empty". Server 400 if bypassed |
| Value > 2,000 chars (paste) | `maxLength` truncates. The server rejects anything longer with 400 |
| Page > `page_count` | Client error. Server 400 `details.page_number` |
| Page input non-numeric or 0 | Client error "Page must be 1 or higher" |
| Editing a term whose AI value was null | `original_value` stays null and `is_edited` = true. "Restore AI value" is hidden. The popover shows "Original AI value: Not found in document" |
| Second edit | `original_*` unchanged (first AI value). `edited_at` updated |
| Restore AI value | Value equals the original. Still `is_edited`. Badge stays |
| Another user's term ID | 404 (RLS → no row) |
| Contract re-processing (`status` not completed) | 409 `INVALID_STATUS`. Toast. The UI reverts |
| Network failure | Rollback, toast with Retry |
| Rate limit (more than 120 edits/min) | 429 → toast "You're doing that a lot — please wait {n} seconds…", rollback |
| Two tabs edit the same term | Last write wins. The originals stay correct because the trigger reads `OLD` |
| Client tries to PATCH `confidence_score` (crafted request) | 400 from `.strict()`. Even if bypassed, the column grant makes Postgres refuse |
| Term deleted mid-edit (contract deleted) | 404 → rollback. Spec 06 handles the subsequent redirect |

---

## 11. Acceptance criteria

- [ ] Clicking any term value opens an inline editor. Enter saves, Shift+Enter adds a newline, Esc cancels, blur saves when changed.
- [ ] A saved edit shows the "Edited" badge immediately and persists after reload (US-009).
- [ ] The P95 time from Save to server confirmation is ≤ 2 s (US-009), measured in E2E and in `withApiHandler` latency logs.
- [ ] The first edit stores the AI value and page in `original_value` / `original_page_number`. Later edits never overwrite them.
- [ ] Every edited term appears in `term_corrections` with `original_value` and `corrected_value`.
- [ ] Authenticated users cannot update any `key_terms` column except `value` and `page_number`, even through direct PostgREST calls.
- [ ] Page numbers outside `1..page_count` are rejected client- and server-side.
- [ ] Failed saves roll back the UI and show a toast with Retry.
- [ ] The editor is fully keyboard operable, has labelled fields, announces errors and returns focus correctly.

---

## 12. Tests

**Unit**
- `KeyTermUpdateSchema`: trims, rejects empty, accepts exactly 2,000 chars, rejects 2,001, rejects unknown keys, accepts `page_number: null`.
- `applyLocalEdit`: first edit captures originals; second edit keeps them; unchanged input returns the same object; an AI-null value keeps `original_value` null with `is_edited` true.
- `InlineTermEditor` (RTL): Enter saves (mutate called with the trimmed value); Shift+Enter doesn't save; Esc restores display mode and focus; blur inside the group (textarea → page input) doesn't save; blur outside saves; page 9 with `pageCount` 6 shows the error and no mutate call.
- `EditedBadge`: shows the original value; "Restore AI value" hidden when `original_value` is null; clicking restore calls mutate with the original value and page.

**Integration (local Supabase)**
- PATCH as owner → 200. The DB row has `is_edited = true`, `original_value` = the AI value, `edited_at` set.
- A second PATCH → `original_value` unchanged, `edited_at` newer.
- PATCH as another user → 404. The DB row is unchanged.
- PATCH with `page_number` > `page_count` → 400 with `details.page_number`.
- PATCH on a contract with `status = 'error'` → 409.
- PATCH body `{ "value": "x", "confidence_score": 99 }` → 400.
- **Direct PostgREST (anon key + user JWT):** `update key_terms set confidence_score = 99` → permission denied. `insert into key_terms` → RLS violation.
- 121 PATCHes in under 60 s → the 121st gets 429 with `Retry-After`.
- `select * from term_corrections` as the owner returns the edited row. As another user it returns 0 rows.

**E2E**
- `contract-review.spec.ts` (step "edit term"): edit "Governing Law" → the "Edited" badge appears within 2 s → reload → the value and badge persist → the popover shows the original value.
- `inline-edit-errors.spec.ts`: intercept PATCH with a 500 → the value reverts and the toast is visible; "Retry" re-opens the editor holding the draft.
