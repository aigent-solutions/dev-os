# 12 — Rate Limiting, AI Usage & Cost Monitoring

## 1. Overview

**Builds:**
1. Per-user fixed-window rate limiting on every write and AI route, backed by the server-only `rate_limits` table and the `check_rate_limit` RPC.
2. Logging of every OpenAI call (tokens, cost, latency, attempts, outcome, prompt version) to the server-only `ai_usage_logs` table.
3. Cost calculation from env-configured prices.
4. Daily monitoring checks: monthly OpenAI budget (`COST_BUDGET_WARNING`) and 7-day correction rate (`PROMPT_REVIEW_NEEDED`).
5. Plan tracking without enforcement.

**References:** PRD §5 (cost ≤ $0.25/analysis, rate limiting on OpenAI calls in v1.0), §3 Secondary Metrics (correction rate ≤ 12%, cost per analysis), §8 Prompt improvement plan, §10 Post-launch monitoring. Engineering doc D4, D5, §6.2 (Rate limiting, Observability), §7.10, §7.11, §7.12, §8.1 (pricing), §8.7, F14.

**Depends on:** `00-foundation.md` (`createAdminSupabase`, logger, `AppError`, `withApiHandler` which converts `RateLimitError` to a 429), `supabase-schema.sql`, `13-data-lifecycle-gdpr.md` (owns the `retention-cleanup` scheduled function that calls the monitoring checks and prunes `rate_limits`).

**Out of scope:** Plan-limit enforcement and billing (Phase 3), a user-facing usage page, IP-based limits for unauthenticated routes (Supabase Auth's built-in limits cover sign-in/sign-up).

---

## 2. User flow

Rate limiting is invisible until a limit is hit:

1. User performs an action (upload, process, chat, edit, feedback).
2. The route calls `enforceRateLimit` before doing any work.
3. Under the limit → the request proceeds normally.
4. Over the limit → `429 RATE_LIMITED` with `Retry-After: <seconds>`; the UI shows "You're doing that a lot — please wait {retry_after} seconds and try again." (toast for mutations, chat bubble for chat). No data is written.
5. After the window resets the action works again.

Usage logging and monitoring have no user-facing flow. The team sees `COST_BUDGET_WARNING` and `PROMPT_REVIEW_NEEDED` lines through the Netlify log drain → Slack (configured in the Netlify UI; no code).

---

## 3. Database

| Object | Client | Operation |
|---|---|---|
| `check_rate_limit(p_user_id, p_bucket, p_limit, p_window_seconds)` | **admin** | `rpc` — returns one row `{ allowed, remaining, reset_at }` |
| `rate_limits` | **admin** (retention job only) | `delete().lt('window_start', <now − 2 days>)` |
| `ai_usage_logs` | **admin** | `insert` (every OpenAI call); `select('cost_usd')` month-to-date (budget check) |
| `term_correction_rate_7d` | **admin** | `select('edited_terms_7d, extracted_terms_7d, correction_rate').single()` |
| `contract_analysis_costs` | **admin** | `select(...)` — used by `evals/` and ad-hoc analysis (§6.6) |

**Server-only guarantee:** `rate_limits` and `ai_usage_logs` have a `RESTRICTIVE` deny-all policy for `anon`/`authenticated` and no table privileges for those roles; `check_rate_limit` is executable by `service_role` only; the four views are revoked from `anon`/`authenticated` (except `term_corrections`, which is user-visible through RLS and not used here). A user JWT can never read or write these objects.

---

## 4. Database tasks

None new. Requires from `supabase-schema.sql`: tables `rate_limits`, `ai_usage_logs` (+ `idx_ai_usage_user_created`, `idx_ai_usage_operation_created`), enum `ai_operation`, function `check_rate_limit` (SECURITY DEFINER, `service_role` only), views `term_correction_rate_7d`, `contract_analysis_costs`, policies `rate_limits_deny_all`, `ai_usage_logs_deny_all`.

---

## 5. API routes

No new routes. This spec defines the rate-limit behaviour that other routes apply:

| Route | Spec | Buckets (checked in this order) |
|---|---|---|
| `POST /api/contracts` | 03 | `upload` |
| `POST /api/contracts/{id}/process` | 05 | `process` |
| `POST /api/contracts/{id}/chat` | 09 | `chat`, then `chat_daily` |
| `PATCH /api/key-terms/{id}` | 08 | `edit` |
| `PUT /api/contracts/{id}/feedback` | 11 | `feedback` |

All other routes (GETs, `/extract`, `PATCH`/`DELETE /api/contracts/{id}`, `/api/account`, `/api/health`) are not rate limited. `/extract` is bounded by `upload` because it only works on a `pending_upload` row created by `POST /api/contracts`.

**429 response** (produced by `toErrorResponse` for `RateLimitError`):

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 37
Cache-Control: no-store
Content-Type: application/json

{ "error": { "code": "RATE_LIMITED", "message": "You're doing that a lot — please wait 37 seconds and try again.",
             "retryable": true, "details": { "bucket": "chat", "retry_after": 37, "reset_at": "2026-10-09T14:20:00.000Z" } },
  "request_id": "req_…" }
```

Rate limits are checked **after** `requireUser()` and Zod validation (invalid requests don't consume quota) and **before** any database write or OpenAI call.

---

## 6. Backend implementation

### 6.1 Files

| File | Purpose |
|---|---|
| `src/lib/api/rate-limit.ts` | `RATE_LIMITS`, `enforceRateLimit` |
| `src/lib/ai/pricing.ts` | `calculateCostUsd` |
| `src/lib/ai/usage-log.ts` | `logAiUsage` |
| `src/server/services/usage.service.ts` | `runCostBudgetCheck`, `runCorrectionRateCheck` |
| `netlify/functions/retention-cleanup.mts` | Calls the monitoring checks after `runRetention` (13) |

### 6.2 `src/lib/api/rate-limit.ts`

```ts
import 'server-only';

export type RateLimitBucket = 'upload' | 'process' | 'chat' | 'chat_daily' | 'edit' | 'feedback';

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  upload:     { limit: 20,  windowSeconds: 3_600 },   // 20 per hour
  process:    { limit: 10,  windowSeconds: 3_600 },   // 10 per hour
  chat:       { limit: 30,  windowSeconds: 600 },     // 30 per 10 minutes
  chat_daily: { limit: 300, windowSeconds: 86_400 },  // 300 per 24 hours
  edit:       { limit: 120, windowSeconds: 60 },      // 120 per minute
  feedback:   { limit: 30,  windowSeconds: 3_600 },   // 30 per hour
};

export async function enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .rpc('check_rate_limit', { p_user_id: userId, p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds })
    .single();

  if (error || !data) {
    // FAIL OPEN (see §6.3)
    logger.error('RATE_LIMIT_CHECK_FAILED', { user_id: userId, bucket, error: error?.message });
    return;
  }
  if (!data.allowed) {
    const retryAfter = Math.max(1, Math.ceil((new Date(data.reset_at).getTime() - Date.now()) / 1000));
    throw new RateLimitError(retryAfter, { bucket, retry_after: retryAfter, reset_at: data.reset_at });
  }
}
```

- `RateLimitError(retryAfterSeconds, details)` builds the `RATE_LIMITED` catalog entry, substituting `{retry_after}` in the message, and `toErrorResponse` adds the `Retry-After` header from `retryAfterSeconds`.
- Fixed window: `window_start` is computed in Postgres from `now()` (single clock), so all Netlify instances share the same windows. A burst at a window boundary can briefly allow up to 2× the limit; acceptable for abuse and cost control at MVP scale.
- Every call increments the counter, including denied calls (a client hammering a limit keeps its counter above the limit until the window ends).

### 6.3 Fail-open decision

If the `check_rate_limit` RPC errors (network blip, DB overload, misconfigured service key), `enforceRateLimit` **allows** the request and logs `RATE_LIMIT_CHECK_FAILED` at error level.

Justification:
- Rate limiting here is a cost and abuse control, not an access control. Authentication and RLS (which protect data) are separate and still enforced.
- If the database is genuinely down, the route fails anyway at its next query; failing closed would only add a second, misleading error.
- A transient limiter failure should not block every upload and chat for every user (99.5% uptime target).
- Exposure is bounded: per-call OpenAI cost is ≤ ~$0.10 and the daily budget check (§6.6) catches sustained overspend; `RATE_LIMIT_CHECK_FAILED` lines alert the team through the log drain.

### 6.4 `src/lib/ai/pricing.ts`

```ts
import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
export function calculateCostUsd(promptTokens: number, completionTokens: number): number {
  const cost = (promptTokens / 1_000_000) * serverEnv.OPENAI_PRICE_INPUT_PER_MTOK
             + (completionTokens / 1_000_000) * serverEnv.OPENAI_PRICE_OUTPUT_PER_MTOK;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 dp, matches numeric(10,6)
}
```

One price pair covers both extraction and chat because both default to the same model (`gpt-4o`). If the two model env vars ever point at differently priced models, this function must gain a `model` parameter — note it in that change's spec.

Reference figure (verify against current OpenAI pricing at deploy, Stage 6): at $2.50 / $10.00 per 1M tokens, an extraction of ~19,000 input + 1,500 output tokens costs ≈ $0.0625, within the $0.20 extraction budget.

### 6.5 `src/lib/ai/usage-log.ts`

```ts
import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const { error } = await createAdminSupabase().from('ai_usage_logs').insert({
      user_id: entry.userId,
      contract_id: entry.contractId,
      operation: entry.operation,
      model: entry.model,
      prompt_version: entry.promptVersion,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      cost_usd: calculateCostUsd(entry.promptTokens, entry.completionTokens),
      latency_ms: Math.round(entry.latencyMs),
      attempts: entry.attempts,
      success: entry.success,
      error_code: entry.errorCode ?? null,
    });
    if (error) throw error;
  } catch (err) {
    logger.error('AI_USAGE_LOG_FAILED', { user_id: entry.userId, contract_id: entry.contractId,
      operation: entry.operation, error: err instanceof Error ? err.message : String(err) });
  }
}
```

**Call sites (one row per logical call):**

| Caller | `operation` | Tokens | `attempts` | `latency_ms` |
|---|---|---|---|---|
| `runExtraction` main call (05) | `extraction` | from `completion.usage` of the successful attempt (0 if all failed) | attempts used by `withRetry` | first attempt start → final outcome |
| `runExtraction` JSON repair retry (05) | `extraction_repair` | from the repair call | 1 | repair call duration |
| `streamChatAnswer` (09) | `chat` | from the `include_usage` chunk (0 if the stream failed before it) | attempts before first token | request start → stream end |

`logAiUsage` is awaited (not fire-and-forget) so serverless functions don't exit before the insert, but it never throws.

### 6.6 Monitoring checks — `src/server/services/usage.service.ts`

Both run once a day from `netlify/functions/retention-cleanup.mts` (schedule `0 3 * * *`, owned by 13) **after** `runRetention()`; each is wrapped in its own try/catch so one failure doesn't skip the other.

```ts
// netlify/functions/retention-cleanup.mts (excerpt — full file in 13)
await runRetention();
await runCostBudgetCheck().catch(e => logger.error('COST_BUDGET_CHECK_FAILED', { error: String(e) }));
await runCorrectionRateCheck().catch(e => logger.error('CORRECTION_RATE_CHECK_FAILED', { error: String(e) }));
```

**`runCostBudgetCheck()`**

```ts
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
let total = 0;
for (let from = 0; ; from += 1000) {                         // PostgREST returns ≤ 1,000 rows per request
  const { data, error } = await admin.from('ai_usage_logs')
    .select('cost_usd').gte('created_at', monthStart)
    .order('id', { ascending: true }).range(from, from + 999);
  if (error) throw error;
  total += data.reduce((s, r) => s + Number(r.cost_usd), 0);
  if (data.length < 1000) break;
}
const budget = serverEnv.OPENAI_MONTHLY_BUDGET_USD;
const pct = budget > 0 ? total / budget : 0;
if (pct >= 0.8) logger.warn('COST_BUDGET_WARNING', {
  month: monthStart.slice(0, 7), month_to_date_usd: +total.toFixed(2), budget_usd: budget, pct_of_budget: Math.round(pct * 100) });
else logger.info('COST_BUDGET_OK', { month: monthStart.slice(0, 7), month_to_date_usd: +total.toFixed(2), budget_usd: budget });
```

Equivalent SQL (for manual checks in the SQL editor):

```sql
select sum(cost_usd) as month_to_date_usd
from public.ai_usage_logs
where created_at >= date_trunc('month', now() at time zone 'utc');
```

Log line format (JSON, one line):

```json
{"level":"warn","msg":"COST_BUDGET_WARNING","time":"2026-10-20T03:00:04.512Z","month":"2026-10","month_to_date_usd":331.4,"budget_usd":400,"pct_of_budget":83}
```

At the PRD's ~2,000 analyses/month this is ~3–10k rows (≤ 10 requests). If monthly rows exceed ~50k, replace the loop with a SQL function (schema change required).

**`runCorrectionRateCheck()`**

```ts
const { data, error } = await admin.from('term_correction_rate_7d')
  .select('edited_terms_7d, extracted_terms_7d, correction_rate').single();
if (error) throw error;
const extracted = Number(data.extracted_terms_7d), rate = data.correction_rate == null ? 0 : Number(data.correction_rate);
if (extracted >= 50 && rate > 0.12) logger.warn('PROMPT_REVIEW_NEEDED', {
  correction_rate: +rate.toFixed(4), edited_terms_7d: Number(data.edited_terms_7d), extracted_terms_7d: extracted,
  prompt_version: serverEnv.EXTRACTION_PROMPT_VERSION });
```

The ≥ 50 extracted-terms floor avoids alerts from tiny samples (e.g. 2 edits out of 10 terms).

**Cost per analysis (`contract_analysis_costs`):** read by `evals/run-extraction-eval.ts` (15) to fail CI if mean `extraction_cost_usd` > $0.20, and available for ad-hoc queries:

```sql
select avg(extraction_cost_usd) as avg_extraction_usd,
       percentile_cont(0.95) within group (order by total_cost_usd) as p95_total_usd
from public.contract_analysis_costs
where first_call_at > now() - interval '30 days';
```

### 6.7 Plan tracking (no enforcement)

- `profiles.plan` defaults to `'trial'` and `trial_ends_at` to signup + 14 days (trigger `handle_new_user`). `authenticated` cannot update either column (column grants).
- MVP code never reads `plan` to allow or deny anything.
- Monthly analyses per user, for future enforcement, are counted on the server with the admin client: `ai_usage_logs` rows where `operation = 'extraction' AND success AND user_id = $1 AND created_at >= <month start>`. Phase 3 billing adds the check at `/process`.

### 6.8 `rate_limits` pruning

Owned by `13-data-lifecycle-gdpr.md` (`runRetention`): `admin.from('rate_limits').delete().lt('window_start', new Date(Date.now() - 2 * 86_400_000).toISOString())`. The longest window is 24 h, so rows older than 2 days are never read again.

---

## 7. State management

No new client state. Client handling of `429`:

- Mutations (`useUploadContract`, `useProcessContract`, `useUpdateKeyTerm`, `useSubmitFeedback`): show the error envelope's `message` in a toast; do **not** auto-retry (`retry: (count, err) => err.status !== 429 && count < 1` in the default mutation options in `00-foundation.md`).
- Chat: the assistant bubble shows the message (09).
- TanStack Query default query options never retry 4xx responses.

---

## 8. Components

None. The 429 message renders through existing toasts (`src/components/ui/Toast`) and the chat bubble.

---

## 9. Design

Rate-limit toasts use the warning (yellow) semantic token with the `AlertTriangle` icon and the catalog message text.

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Exactly the limit (e.g. 30th chat in 10 min) | Allowed (`count <= limit`) |
| Limit + 1 | `429`, `Retry-After ≥ 1` |
| Request at the window boundary | New window: counter restarts at 1 |
| `check_rate_limit` errors | Request allowed; `RATE_LIMIT_CHECK_FAILED` logged |
| Validation fails | `400`; counter not incremented (check happens after validation) |
| Chat allowed by `chat` but denied by `chat_daily` | `429` (bucket `chat_daily`); the `chat` counter was still incremented (acceptable) |
| Authenticated user calls `rpc('check_rate_limit')` directly | Permission denied (EXECUTE only for `service_role`) |
| Authenticated user selects/inserts `ai_usage_logs` or `rate_limits` | Permission denied (no table privileges + restrictive policy) |
| `logAiUsage` insert fails | Logged as `AI_USAGE_LOG_FAILED`; the user's request still succeeds |
| OpenAI returns no `usage` (stream aborted early) | Logged with 0 tokens, `cost_usd = 0`, `success = false` |
| Budget env var is 0 | `pct` treated as 0; no warning (misconfiguration surfaced by env validation, which requires `> 0`) |
| `term_correction_rate_7d.correction_rate` is null (no terms in 7 days) | Treated as 0; no alert |
| Contract deleted | `ai_usage_logs.contract_id` set to NULL by FK; cost history kept |
| Account deleted | `ai_usage_logs` and `rate_limits` rows deleted by cascade |

---

## 11. Acceptance criteria

- [ ] The six buckets enforce exactly: upload 20/h, process 10/h, chat 30/10 min, chat_daily 300/24 h, edit 120/min, feedback 30/h.
- [ ] Over-limit requests return `429 RATE_LIMITED` with a `Retry-After` header and the catalog message with seconds substituted; no data is written.
- [ ] Every OpenAI call (extraction, repair, chat — success or failure) writes exactly one `ai_usage_logs` row with tokens, `cost_usd`, `latency_ms`, `attempts`, `success`, `prompt_version`.
- [ ] `cost_usd` equals `prompt_tokens/1e6 × input price + completion_tokens/1e6 × output price`, rounded to 6 dp.
- [ ] The daily job logs `COST_BUDGET_WARNING` when month-to-date cost ≥ 80% of `OPENAI_MONTHLY_BUDGET_USD`.
- [ ] The daily job logs `PROMPT_REVIEW_NEEDED` when the 7-day correction rate > 0.12 with ≥ 50 extracted terms.
- [ ] An authenticated user cannot read, insert, update or delete `rate_limits` or `ai_usage_logs`, cannot call `check_rate_limit`, and cannot read `term_correction_rate_7d`, `term_corrections_anonymised` or `contract_analysis_costs`.
- [ ] A limiter failure never blocks a request.

---

## 12. Tests

**Unit**
- `pricing.test.ts`: 15,000/1,500 tokens at $2.50/$10 → `0.0525`; rounding to 6 dp; zero tokens → 0.
- `rate-limit.test.ts` (mock admin client): allowed → resolves; denied → `RateLimitError` with `retryAfterSeconds = ceil((reset_at − now)/1000)` (fake timers), minimum 1; RPC error → resolves and logs `RATE_LIMIT_CHECK_FAILED`.
- `usage-log.test.ts`: maps fields to snake_case columns; insert error → no throw, logs `AI_USAGE_LOG_FAILED`.
- `usage.service.test.ts`: budget 400, MTD 320 → `COST_BUDGET_WARNING` with `pct_of_budget: 80`; MTD 319 → `COST_BUDGET_OK`; pagination sums across 2,500 rows; correction rate 0.13 with 49 terms → no alert, with 50 terms → `PROMPT_REVIEW_NEEDED`.

**Integration (local Supabase)**
- `check_rate_limit` via service role: 20 calls `allowed = true`, 21st `allowed = false`, `remaining = 0`, `reset_at` = window start + window.
- `POST /api/contracts` 21 times within an hour → 21st is `429` with `Retry-After`; no 21st `contracts` row.
- `PATCH /api/key-terms/{id}` 121 times in a minute → 121st `429`.
- **RLS / privileges (CI-blocking), using a user JWT (`authenticated`):**
  - `select * from rate_limits` → permission denied; `insert into rate_limits …` → permission denied.
  - `select * from ai_usage_logs where user_id = auth.uid()` → permission denied (own rows included); `insert` → permission denied.
  - `rpc('check_rate_limit', …)` → permission denied.
  - `select` from `term_correction_rate_7d`, `term_corrections_anonymised`, `contract_analysis_costs` → permission denied.
  - Same checks with the `anon` key.
- Catalog check: `pg_class.relrowsecurity` true and ≥ 1 `pg_policies` row for `rate_limits` and `ai_usage_logs`; `information_schema.role_table_grants` has no rows for `anon`/`authenticated` on them.
- Extraction via mocked OpenAI → one `ai_usage_logs` row `operation = 'extraction'`, correct tokens and cost; forced invalid JSON then valid repair → an additional `extraction_repair` row.

**E2E**
- Covered indirectly: `upload-errors.spec.ts` asserts a mocked `429` from `/process` shows the wait-time toast.
