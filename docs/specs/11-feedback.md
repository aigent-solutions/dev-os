# 11 — Feedback (Thumbs Up/Down + Comment)

## 1. Overview

**Builds:** per-contract feedback on the AI review.
- A thumbs-up / thumbs-down rating (required).
- An optional comment (≤ 1,000 chars).
- The optional beta accuracy question "Were the extracted terms accurate?" (Yes / Partially / No).

It is saved with `PUT /api/contracts/{id}/feedback` as an upsert into `user_feedback`, and pre-filled from `GET /api/contracts/{id}`.

**References:** engineering-doc §4.3 step 13, §7.9 (`user_feedback`), §9.5. PRD US-010, FR-12 (stored with user_id, contract_id, rating, comment, timestamp). PRD §10 beta satisfaction survey ("Were the extracted terms accurate?" ≥ 75% Yes) and §3 NPS (the `nps_score` column exists, but its UI is Phase 2).

**Depends on:** `06-results-key-terms-panel.md` (`ContractDetail.feedback`, `SidePanel` placement), `12-rate-limiting-usage.md` (`feedback` bucket), `supabase-schema.sql`.

---

## 2. User flow

1. At the bottom of the "Key Terms" tab on a `completed` contract, the user sees a card: "Was this review helpful?" with 👍 and 👎 toggle buttons.
2. Clicking a thumb immediately saves `{ rating }` along with any current comment and accuracy answer. The chosen thumb shows as pressed, and the card expands to show the optional fields.
3. Optional: the user answers "Were the extracted terms accurate?" (radio: Yes / Partially / No). Each change saves immediately.
4. Optional: the user types a comment and clicks "Send comment".
5. After each successful save: the inline status text "Thanks for your feedback".
6. Reopening the contract later shows the saved rating, accuracy answer and comment, pre-filled from `GET /api/contracts/{id}`. The user can change any of them, and each change upserts the same row.

---

## 3. Database

| Operation | Table | Client | Query |
|---|---|---|---|
| Ownership + status check | `contracts` | user | `select id, status from contracts where id = $1` → `.maybeSingle()` |
| Upsert | `user_feedback` | user | `insert into user_feedback (user_id, contract_id, rating, comment, accuracy_rating) values (…) on conflict (user_id, contract_id) do update set rating = excluded.rating, comment = excluded.comment, accuracy_rating = excluded.accuracy_rating returning id, rating, comment, accuracy_rating, updated_at` |
| Prefill | `user_feedback` | user | In `getContractDetail` (spec 06): `select rating, comment, accuracy_rating from user_feedback where contract_id = $1` |

supabase-js call:

```ts
supabase.from('user_feedback')
  .upsert({ user_id, contract_id, rating, comment, accuracy_rating }, { onConflict: 'user_id,contract_id' })
  .select('id, rating, comment, accuracy_rating, updated_at')
  .single();
```

**RLS** (`supabase-schema.sql`, all `to authenticated`):
- `user_feedback_select_own`: `user_id = auth.uid()`.
- `user_feedback_insert_own`: `user_id = auth.uid()` **and** the contract is owned by `auth.uid()`.
- `user_feedback_update_own`: `user_id = auth.uid()`.

`INSERT … ON CONFLICT DO UPDATE` needs all three, and all three exist. There is no DELETE policy: users can change feedback but not remove it. It is deleted by cascade with the contract or account.

`nps_score` is **not** included in the upsert payload, so an existing value (Phase 2) is never overwritten. `created_at` stays at the first submission. `updated_at` is maintained by `trg_user_feedback_updated_at`.

---

## 4. Database tasks

None new. Uses `user_feedback`, its unique constraint `user_feedback_user_contract_key (user_id, contract_id)`, check constraints (`comment` ≤ 1,000, `nps_score` 0–10), enums `feedback_rating` and `accuracy_rating`, and the three RLS policies.

**Analytics queries** (service role, for the beta satisfaction metric and NPS reporting):

```sql
-- Beta: share of "yes" to "Were the extracted terms accurate?" (target ≥ 75%)
select accuracy_rating, count(*), round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from user_feedback where accuracy_rating is not null
group by accuracy_rating;

-- Thumbs ratio, last 30 days
select rating, count(*) from user_feedback
where updated_at > now() - interval '30 days' group by rating;
```

---

## 5. API routes

### `PUT /api/contracts/{id}/feedback`

File: `src/app/api/contracts/[id]/feedback/route.ts`. `export const runtime = 'nodejs'`.

| Field | Value |
|---|---|
| Auth | Required (`requireUser`) |
| Rate limit | `feedback` — 30 requests / 3,600 s per user |
| Params | `ContractIdParamsSchema` (UUID). Invalid → 404 (`parseParamsOr404`) |
| Body | `FeedbackSchema` |
| Semantics | **Full replace** of the user-editable fields. Omitted `comment` / `accuracy_rating` are stored as `null`. The client always sends its complete current state |

```ts
// src/lib/validation/feedback.ts
export const FeedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  comment: z.string().trim()
    .max(MAX_FEEDBACK_COMMENT, `Comment must be ${MAX_FEEDBACK_COMMENT} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : null)),          // '' → null
  accuracy_rating: z.enum(['yes', 'partially', 'no']).nullable().optional()
    .transform((v) => v ?? null),
}).strict();
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
```

**Validation rules:** `rating` is required. `comment` is ≤ 1,000 chars after trim, and empty becomes null. `accuracy_rating` is one of the enum values or null. The parent contract must exist, be owned by the user (else 404), and have `status = 'completed'` (else `409 INVALID_STATUS`).

**Response `200`**

```json
{ "id": "uuid", "rating": "up", "comment": "Spot on for the liability cap.", "accuracy_rating": "yes", "updated_at": "2026-10-09T10:20:00.000Z" }
```

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND`, `409 INVALID_STATUS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### Prefill: `GET /api/contracts/{id}` (spec 06)

`feedback: { "rating": "up" | "down", "comment": string | null, "accuracy_rating": "yes" | "partially" | "no" | null } | null`

---

## 6. Backend implementation

### 6.1 Route handler

```ts
export const runtime = 'nodejs';

export const PUT = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, ContractIdParamsSchema);
  await enforceRateLimit(user.id, 'feedback');
  const input = await parseBody(req, FeedbackSchema);
  const saved = await upsertFeedback(supabase, user.id, id, input);
  log.info('feedback_saved', { user_id: user.id, contract_id: id, rating: saved.rating, has_comment: saved.comment !== null });
  return Response.json(saved);
});
```

Comment text is never logged.

### 6.2 `src/server/services/feedback.service.ts`

```ts
export type FeedbackResult = { id: string; rating: 'up' | 'down'; comment: string | null;
  accuracy_rating: 'yes' | 'partially' | 'no' | null; updated_at: string };

export async function upsertFeedback(
  supabase: SupabaseClient<Database>, userId: string, contractId: string, input: FeedbackInput,
): Promise<FeedbackResult>;
```

Steps:
1. `select id, status from contracts where id = contractId` (user client). Null → `appError('NOT_FOUND')`.
2. `status !== 'completed'` → `appError('INVALID_STATUS')`.
3. Upsert (§3) with `user_id: userId`, `contract_id: contractId`, `rating`, `comment`, `accuracy_rating`.
4. A Postgres `23514` (check violation) → `ValidationError({ comment: ... })`. A `42501` / RLS violation → `NOT_FOUND`, which is defensive (step 1 already proved ownership). Anything else → `INTERNAL_ERROR`.

---

## 7. State management

### 7.1 `useSubmitFeedback` — `src/hooks/useSubmitFeedback.ts`

```ts
export function useSubmitFeedback(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: 'up' | 'down'; comment?: string; accuracy_rating?: 'yes' | 'partially' | 'no' | null }) =>
      apiFetch<FeedbackResult>(`/api/contracts/${contractId}/feedback`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      qc.setQueryData<ContractDetail>(qk.contract(contractId), (d) => d && ({
        ...d, feedback: { rating: res.rating, comment: res.comment, accuracy_rating: res.accuracy_rating },
      }));
    },
  });
}
```

Not optimistic for the comment (the button shows pending). The thumb's pressed state updates immediately from local state and reverts on error.

### 7.2 Local state (`FeedbackWidget`)

`rating: 'up' | 'down' | null`, `accuracy: 'yes' | 'partially' | 'no' | null`, `commentDraft: string`, `savedComment: string | null`, `status: 'idle' | 'saving' | 'saved' | 'error'`. Initialised from `initialFeedback`. Re-initialised when `contractId` changes.

**Payload rule:** every save sends `{ rating, accuracy_rating: accuracy, comment: savedComment ?? undefined }`. Rating and accuracy changes send the last **saved** comment, not the unsent draft. The "Send comment" button sends `commentDraft`.

---

## 8. Components

### 8.1 `FeedbackWidget` — `src/components/feedback/FeedbackWidget.tsx`

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `initialFeedback` | `ContractDetail['feedback']` |

**Placement:** spec 06 `SidePanel` → "Key Terms" tab, after `KeyTermsPanel`. It is rendered only when `contract.status === 'completed'`.

**Structure**

```
<section aria-labelledby="feedback-heading">  (card)
  <h3 id="feedback-heading">Was this review helpful?</h3>
  <div role="group" aria-label="Rate this review">
    <button aria-pressed={rating==='up'}   aria-label="Yes, helpful"> ThumbsUp </button>
    <button aria-pressed={rating==='down'} aria-label="No, not helpful"> ThumbsDown </button>
  </div>
  {rating && (
    <fieldset>
      <legend>Were the extracted terms accurate? (optional)</legend>
      RadioGroup: Yes | Partially | No
    </fieldset>
    <label for="feedback-comment">Anything we should know? (optional)</label>
    <textarea id="feedback-comment" maxLength=1000 rows=3 />
    <span aria-live="polite">{n}/1000</span>   (shown when n > 900)
    <button>Send comment</button>              (disabled when the draft equals savedComment or the status is saving)
  )}
  <p aria-live="polite">{statusText}</p>
</section>
```

**Behaviour**

| Action | Effect |
|---|---|
| Click a thumb (different from current) | Set `rating` and save |
| Click the current thumb | No-op. Ratings can be changed but not removed |
| Change accuracy | Set `accuracy` and save. Choosing "Clear" is not offered; once answered it can be changed but not cleared |
| "Send comment" | Save with `commentDraft`. On success `savedComment = trimmed draft or null` |
| Save success | `statusText = 'Thanks for your feedback'` (Green 700, `CheckCircle2` icon) |
| Save error | Revert the thumb/accuracy to the last saved values. `statusText = error.message` (Red 700). For 429 the catalog message includes the wait time |
| Initial render with saved feedback | Thumb pressed, optional fields expanded, values pre-filled. No status text |

The thumbs are 40×40 icon buttons (touch target ≥ 40 px). Pressed state: Blue 50 background, Blue 500 border, Blue 700 icon. Unpressed: white with a Grey 100 border.

### 8.2 States

| State | Rendering |
|---|---|
| Loading | Not separate: rendered from cached contract detail |
| Saving | Pressed control shows `aria-busy`; "Send comment" shows a spinner |
| Error | Status text in Red 700; controls revert |
| Success | "Thanks for your feedback" |
| Not completed contract | Widget not rendered |

---

## 9. Design

| Element | Tokens |
|---|---|
| Card | White, 1 px Grey 100 border, radius 8 px, padding 16 px, 12 px internal gap; 24 px top margin from the term list |
| Heading | Paragraph Large Medium (16/24 500), `--text-primary` |
| Legend / labels | Paragraph Small (12/18), `--text-secondary` |
| Radio group | Radix RadioGroup; 16 px circles; checked fill `--brand`; focus ring 2 px Blue 500 |
| Textarea | Input pattern from design system: 1 px Grey 100, radius 6 px, 8 px 12 px padding |
| Button | Secondary (white, Grey 100 border), height 32 px, radius 6 px |
| Status text | Paragraph Small; success Green 700, error Red 700, each with an icon (not colour alone) |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| First submission | Insert. `created_at` = `updated_at` |
| Changing the rating later | Update of the same row (unique `user_id, contract_id`). `updated_at` bumped |
| Comment of exactly 1,000 chars | Accepted |
| Comment over 1,000 chars | Client `maxLength`. Server 400 if bypassed. DB check as the last line |
| Whitespace-only comment | Stored as `null` |
| Rating change while a comment draft is unsent | Rating saves with the last saved comment. The draft stays in the textarea and the "Send comment" button stays enabled |
| Contract not completed (crafted request) | 409 `INVALID_STATUS` |
| Another user's contract | 404 (the user-client read finds no row; the insert policy would also reject it) |
| More than 30 saves in an hour | 429 → status text with the wait time. UI reverts |
| Contract deleted in another tab | 404 → status text "We couldn't find that contract." Spec 06 redirects on its next query |
| `nps_score` set by Phase 2 UI | Untouched by this endpoint |
| Account or contract deletion | Feedback row removed by FK cascade |

---

## 11. Acceptance criteria

- [ ] A completed contract's results page shows thumbs up/down and, after rating, the optional accuracy question and comment box (US-010).
- [ ] Each save writes one `user_feedback` row per (user, contract) with `user_id`, `contract_id`, `rating`, `comment`, `accuracy_rating`, `created_at` and `updated_at` (FR-12). Re-saving updates the same row.
- [ ] Reopening the contract pre-fills the saved feedback.
- [ ] Comments over 1,000 chars are rejected client- and server-side. Empty comments are stored as null.
- [ ] Feedback cannot be written for another user's contract (404) or a non-completed contract (409).
- [ ] The `feedback` rate limit (30/hour) returns 429 with `Retry-After`.
- [ ] Controls are keyboard operable, the thumbs expose `aria-pressed`, and the status is announced through `aria-live`.

---

## 12. Tests

**Unit**
- `FeedbackSchema`: requires `rating`; `''` → null comment; 1,001 chars rejected; unknown keys rejected; `accuracy_rating` omitted → null.
- `FeedbackWidget` (RTL, mocked hook):
  - Clicking 👍 calls mutate with `{ rating: 'up', accuracy_rating: null }` and expands the fields.
  - Clicking 👍 again doesn't call mutate.
  - Changing accuracy sends the saved comment, not the draft.
  - "Send comment" is disabled when the draft equals the saved comment.
  - On error the thumb reverts and the error text shows.
  - Prefill renders the pressed state and values.

**Integration (local Supabase)**
- PUT as owner on a completed contract → 200, and one row exists. A second PUT with `rating: 'down'` → the same `id`, rating updated, `updated_at` > `created_at`.
- PUT without `comment` after a comment was saved → the comment becomes null (full-replace semantics).
- Seed `nps_score = 9`, then PUT → `nps_score` is still 9.
- PUT as another user → 404. A direct PostgREST insert with another user's `contract_id` → RLS violation.
- PUT on a `processing` contract → 409.
- The 31st PUT within an hour → 429.
- GET `/api/contracts/{id}` after a PUT → `feedback` matches.

**E2E**
- `feedback.spec.ts`: open a completed contract → click 👍 → "Thanks for your feedback" → choose "Partially" → type a comment → Send → reload → 👍 is pressed, "Partially" is checked, and the comment is pre-filled.
