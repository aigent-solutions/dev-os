# ContractIQ — Implementation Specs

**Input:** `docs/engineering/engineering-doc.md` (approved). Section references like "§6.6" point to that document.
**Scope:** MVP (roadmap v0.1 → v1.0) in full, plus the Phase 2 (v1.1) export feature that the engineering doc designs. Phase 3 (v1.2) features only have roadmap-level descriptions in the engineering doc. They get specs when that phase is planned.

This file is the index **and** the shared contract that every spec relies on: module names, function signatures, error codes, constants, query keys. If a spec and this file disagree, this file wins. Fix the spec.

---

## 1. Spec index and build order

Build in this order. Each spec lists its own dependencies.

| # | File | Specifies | Engineering-doc features |
|---|---|---|---|
| — | `supabase-schema.sql` | Paste-and-run SQL: enums, tables, indexes, triggers, RLS, RPCs, views, Storage bucket and policies | §7, FR-13, FR-14 |
| — | `../../.env.example` | Every environment variable, grouped by service | §6, §8 |
| 00 | `00-foundation.md` | Scaffold, env validation, Supabase clients, API handler wrapper, errors, logging, middleware, design tokens, security headers, Netlify config, health endpoint | F1 |
| 01 | `01-auth.md` | Sign up with email verification, sign in, sign out, callback, route protection | F3, US-001, FR-01 |
| 02 | `02-landing.md` | Static marketing page | F2 |
| 03 | `03-upload-extraction.md` | Upload wizard, direct-to-Storage upload, server text extraction with `[PAGE N]` markers, limits | F5, US-002, FR-02, FR-03 |
| 04 | `04-term-preview-custom-terms.md` | Term library, preview card, custom terms (≤ 5) | F7, US-005, FR-05 |
| 05 | `05-key-term-extraction.md` | `/process`, background function, sync fallback, prompts, post-processing, status polling, retry | F6, F12, US-002–004, FR-04, FR-11, §6.6, §8 |
| 06 | `06-results-key-terms-panel.md` | Results page shell, key terms panel, confidence bands, ⚠️, "Why?", disclaimer, banners, mark review complete | F8, US-004, FR-04, FR-11 |
| 07 | `07-document-viewer.md` | PDF.js viewer, text viewer fallback, click-to-page, highlights | F9, US-006, FR-06, FR-07 |
| 08 | `08-inline-editing.md` | Inline term correction with original-value preservation | F10, US-009 |
| 09 | `09-contract-chat.md` | SSE chat, query classification, citations, persistent history | F11, US-007, US-012, FR-08, FR-09 |
| 10 | `10-dashboard.md` | Summary cards, sortable contract list, delete from list | F4, US-008, FR-10 |
| 11 | `11-feedback.md` | Thumbs up/down and comment per contract | F13, US-010, FR-12 |
| 12 | `12-rate-limiting-usage.md` | Rate limit buckets, AI usage and cost logging, cost views and budget alert | F14 |
| 13 | `13-data-lifecycle-gdpr.md` | Contract delete, account delete, 90-day PDF retention, pending sweep, settings page | F15 |
| 14 | `14-onboarding-a11y.md` | First-run tooltips, jargon tooltips, WCAG 2.1 AA requirements | F16 |
| 15 | `15-evals.md` | Offline AI evaluation harness and CI gates | §10 PRD, §13.5 |
| 16 | `16-export.md` | *(Phase 2)* CSV and PDF export | US-011 |

**Recommended build order:** 00 → schema → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 12 → 09 → 10 → 11 → 13 → 14 → 15 → 16.

---

## 2. Spec file structure

Every feature spec uses these sections, in this order. If a section doesn't apply, it says "None" and explains why.

1. **Overview** — what it builds, PRD/engineering-doc references, dependencies
2. **User flow** — numbered steps
3. **Database** — tables, columns, client (user vs service role) and exact queries
4. **Database tasks** — what must exist in `supabase-schema.sql`, plus any seed data
5. **API routes** — full contracts (method, path, auth, rate limit, request, validation, responses, errors)
6. **Backend implementation** — files, function signatures, step-by-step logic
7. **State management** — TanStack Query keys, Zustand slices, local state
8. **Components** — tree, props, behaviour, states (loading, empty, error, success)
9. **Design** — design-system tokens (`docs/design.md`) to use
10. **Edge cases** — condition → expected behaviour
11. **Acceptance criteria** — checklist that can be tested
12. **Tests** — unit, integration, E2E cases

---

## 3. Shared module contract

Every spec uses these names and signatures. TypeScript, `strict: true`. Paths are relative to the app root. `@/` = `src/`.

### 3.1 Environment — `src/lib/env.ts`

```ts
import '@/lib/server-guard'; // serverEnv only (see §3.11); publicEnv lives in src/lib/env.public.ts
export const serverEnv: {
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_EXTRACTION_MODEL: string;        // default 'gpt-4o'
  OPENAI_CHAT_MODEL: string;              // default 'gpt-4o'
  OPENAI_PRICE_INPUT_PER_MTOK: number;
  OPENAI_PRICE_OUTPUT_PER_MTOK: number;
  OPENAI_USER_HASH_SALT: string;          // min 32 chars
  OPENAI_MONTHLY_BUDGET_USD: number;
  EXTRACTION_PROMPT_VERSION: string;      // default 'extraction-v1.0'
  CHAT_PROMPT_VERSION: string;            // default 'chat-v1.0'
  CHAT_MAX_INPUT_TOKENS: number;          // default 100_000
  PROCESSING_MODE: 'background' | 'sync'; // default 'background'
  PROCESSING_SYNC_FALLBACK: boolean;      // default true
  SYNC_PROCESSING_BUDGET_MS: number;      // default 24_000
  INTERNAL_FUNCTION_SECRET: string;       // min 32 chars
  SITE_URL: string;                       // process.env.URL ?? NEXT_PUBLIC_APP_URL
  COMMIT_REF: string;                     // process.env.COMMIT_REF ?? 'dev'
};
// src/lib/env.public.ts
export const publicEnv: {
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_SHOW_CALIBRATION_WARNING: boolean; // default false
};
```

### 3.2 Supabase clients — `src/lib/supabase/`

| File | Export | Use |
|---|---|---|
| `client.ts` | `createBrowserSupabase(): SupabaseClient<Database>` | Client components: auth calls, Storage upload |
| `server.ts` | `createServerSupabase(): SupabaseClient<Database>` | Server components and route handlers. User-scoped (RLS applies). Reads and writes cookies through `next/headers` |
| `admin.ts` (`import '@/lib/server-guard'`) | `createAdminSupabase(): SupabaseClient<Database>` | **Service role — bypasses RLS.** Only for the uses listed in §3.9 |
| `middleware.ts` | `updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User \| null }>` | Called from root `middleware.ts` |

`Database` type: `src/types/database.types.ts`, generated with `supabase gen types typescript --project-id <id> > src/types/database.types.ts`.

### 3.3 API layer — `src/lib/api/`

```ts
// errors.ts
export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number, public userMessage: string,
              public retryable = false, public details?: Record<string, unknown>) { super(code); }
}
export class ValidationError   extends AppError {} // 400 VALIDATION_ERROR, details = { field: message }
export class UnauthorizedError extends AppError {} // 401 UNAUTHORIZED
export class ForbiddenError    extends AppError {} // 403 FORBIDDEN
export class NotFoundError     extends AppError {} // 404 NOT_FOUND
export class ConflictError     extends AppError {} // 409, code passed in
export class PayloadError      extends AppError {} // 413 | 422, code passed in
export class RateLimitError    extends AppError { constructor(public retryAfterSeconds: number, details?: Record<string, unknown>) } // 429 RATE_LIMITED; fills {retry_after}; toErrorResponse sets Retry-After
export class UpstreamError     extends AppError {} // 502, code passed in
export class TimeoutError      extends AppError {} // 504 UPSTREAM_TIMEOUT
export function appError(code: ErrorCode, details?: Record<string, unknown>): AppError; // builds from ERROR_CATALOG (§4)
// error-catalog.ts: ERROR_CATALOG, ErrorCode, CONTRACT_ERROR_CODES, ContractErrorCode, CONTRACT_ERROR_MESSAGE
export function toErrorResponse(err: unknown, requestId: string): Response;

// with-api-handler.ts
export type ApiContext<P> = { params: P; requestId: string; log: Logger };
export function withApiHandler<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: ApiContext<P>) => Promise<Response>,
): (req: NextRequest, ctx: { params: P }) => Promise<Response>;
// Generates request_id ('req_' + nanoid(12)), catches errors → toErrorResponse,
// logs method/path/status/latency, sets Cache-Control: no-store and x-request-id.

// require-user.ts
export async function requireUser(): Promise<{ user: User; supabase: SupabaseClient<Database> }>;
// supabase.auth.getUser(); no user or !user.email_confirmed_at → UnauthorizedError

// parse.ts
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>>;
export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S>;
export function parseParams<S extends ZodTypeAny>(params: unknown, schema: S): z.infer<S>;
// All throw ValidationError with details from zod's flatten().fieldErrors
export const IdParamsSchema: ZodObject<{ id: ZodString /* uuid */ }>;
export function parseParamsOr404<S extends ZodTypeAny>(params: unknown, schema: S): z.infer<S>; // malformed route id → NotFoundError, not 400

// rate-limit.ts
export type RateLimitBucket = 'upload' | 'process' | 'chat' | 'chat_daily' | 'edit' | 'feedback';
export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }>;
export async function enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void>; // throws RateLimitError

// internal-auth.ts
export function assertInternalRequest(req: Request): void; // timingSafeEqual on x-internal-secret, else UnauthorizedError
export function internalAuthHeaders(): Record<string, string>;

// sse.ts
export function createSseResponse(
  run: (send: (event: 'meta' | 'token' | 'done' | 'error', data: unknown) => void, signal: AbortSignal) => Promise<void>,
): Response; // text/event-stream; no-cache; keep-alive comment every 15 s; closes when run resolves
```

JSON success responses use `Response.json(body, { status })`. Error envelope (§9 of the engineering doc):

```json
{ "error": { "code": "RATE_LIMITED", "message": "…", "retryable": true, "details": {} }, "request_id": "req_…" }
```

### 3.4 Shared utilities

```ts
// src/lib/api-client.ts — the ONLY way hooks call JSON APIs (00-foundation.md §6.10).
// Exceptions: chat SSE (src/lib/chat/sse-client.ts), export downloads (16), the health banner.
export class ApiClientError extends Error { status: number; code: string; retryable: boolean;
  details: Record<string, unknown>; requestId: string | null; retryAfterSeconds: number | null }
export async function apiFetch<T>(path: string,
  init?: RequestInit & { json?: unknown; timeoutMs?: number /* default 30_000 */ }): Promise<T>;
// Network failure → ApiClientError(0, 'NETWORK_ERROR'). 401 → QueryProvider redirects to /login?next=…

// src/lib/text/match.ts — the one normalisation for source-sentence matching (server + UI; 07 §6.2, 05 §6.6)
export function normalizeForMatch(s: string): string;
export function normalizeWithMap(text: string): { normalized: string; map: number[] };
export function findSentenceRange(haystack: string, sentence: string): { start: number; end: number } | null;

// src/lib/retry.ts
export type RetryOptions = { attempts: number; baseDelayMs: number; factor: number; jitter: boolean;
  maxDelayMs?: number; deadlineAt?: number; minRemainingMsForRetry?: number;
  isRetryable: (err: unknown) => boolean; perAttemptTimeoutMs: number | ((remainingMs: number) => number) };
export async function withRetry<T>(fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  opts: RetryOptions): Promise<{ result: T; attempts: number }>;
export function isRetryableOpenAIError(err: unknown): boolean; // 429, 500, 502, 503, 504, ETIMEDOUT, ECONNRESET, AbortError (timeout)
export const BACKGROUND_RETRY: Omit<RetryOptions, 'isRetryable'>; export function sleep(ms: number): Promise<void>;

// src/lib/logger.ts
export type Logger = { info(msg: string, f?: object): void; warn(...): void; error(...): void; child(f: object): Logger };
export const logger: Logger; // JSON lines: { level, msg, time, request_id?, user_id?, contract_id?, ... }

// src/lib/utils.ts
export function cn(...classes: ClassValue[]): string;   // clsx + tailwind-merge
export function slugify(input: string): string;          // lowercase, [a-z0-9_], spaces/hyphens → '_', max 50
export function safeFileName(original: string): string;  // slugify(basename without .pdf) || 'contract', max 80, + '.pdf'
export function formatBytes(n: number): string;
```

### 3.5 Constants — `src/lib/constants.ts`

```ts
export const STORAGE_BUCKET = 'contracts';
export const MAX_FILE_BYTES = 10_485_760;
export const MAX_PAGES = 20;
export const MIN_WORDS = 100;
export const MAX_CONTRACT_TOKENS = 15_000;
export const MAX_CUSTOM_TERMS = 5;
export const CUSTOM_TERM_MIN = 2;
export const CUSTOM_TERM_MAX = 60;
export const CUSTOM_TERM_PATTERN = /^[\p{L}\p{N} ,.'&()/-]+$/u;
export const MAX_TERM_VALUE_CHARS = 2_000;
export const MAX_CHAT_MESSAGE_CHARS = 2_000;
export const MAX_CHAT_HISTORY = 200;
export const MAX_FEEDBACK_COMMENT = 1_000;
export const SIGNED_URL_TTL_SECONDS = 3_600;
export const PROCESSING_TIMEOUT_MS = 120_000;
export const MAX_PROCESSING_ATTEMPTS = 5;
export const STATUS_POLL_INTERVAL_MS = 2_000;
export const DISPATCH_TIMEOUT_MS = 3_000;
export const OPENAI_TIMEOUT_MS = 20_000;
export const CHAT_STREAM_TIMEOUT_MS = 24_000; // total stream; < Netlify's 26 s (replaces engineering-doc §8.1's 45 s — see §6)
export const CONFIDENCE_HIGH = 80;   // ≥ 80 green
export const CONFIDENCE_LOW = 50;    // < 50 red + ⚠️ ; 50–79 amber
export const UNVERIFIED_CONFIDENCE_CAP = 49;
export const PDF_RETENTION_DAYS = 90;
export const PENDING_UPLOAD_TTL_HOURS = 24;
export const LEGAL_DISCLAIMER =
  'This is an AI-assisted review tool, not legal advice. Always verify critical terms with a qualified lawyer.';
export const LOW_CONFIDENCE_TOOLTIP =
  'Low confidence — we recommend verifying this in the document directly.';
export const NOT_FOUND_ANSWER = 'I cannot find this in the document.';
```

### 3.6 Domain types — `src/types/domain.ts`

```ts
export type ContractType = 'nda' | 'msa';
export type DetectedContractType = 'nda' | 'msa' | 'other';
export type ContractStatus = 'pending_upload' | 'ready' | 'processing' | 'completed' | 'error';
export type ProcessingStage = 'analysing' | 'compiling';
export type ChatRole = 'user' | 'assistant';
export type ChatQueryType = 'contract' | 'history' | 'both';
export type ConfidenceBand = 'high' | 'medium' | 'low'; // ≥80 | 50–79 | <50
export function confidenceBand(score: number): ConfidenceBand;

export type KeyTerm = { id: string; term_key: string; term_name: string; is_custom: boolean;
  value: string | null; page_number: number | null; confidence_score: number;
  source_sentence: string | null; source_verified: boolean; is_edited: boolean;
  original_value: string | null; original_page_number: number | null; edited_at: string | null; display_order: number };

export type ChatMessage = { id: string; role: ChatRole; content: string; cited_pages: number[];
  is_not_found: boolean; citation_missing: boolean; status: 'complete' | 'error'; created_at: string };
```

API request/response DTOs live in `src/types/api.ts`. They are inferred from the Zod schemas in `src/lib/validation/*` where a schema exists.

### 3.7 AI modules — `src/lib/ai/`

```ts
// term-library.ts
export type TermDefinition = { key: string; name: string; description: string | null; extractionHint: string };
export const TERM_LIBRARY: Record<ContractType, TermDefinition[]>;
export type RequestedTerm = TermDefinition & { isCustom: boolean; customKeyTermId: string | null; displayOrder: number };
export function buildRequestedTerms(type: ContractType, custom: { id: string; term_name: string }[]): RequestedTerm[];
export function customTermKey(name: string): string; // 'custom_' + slugify(name)

// openai-client.ts  (server-only)
export function getOpenAI(): OpenAI;               // singleton, maxRetries: 0 (we retry ourselves)
export function hashUserId(userId: string): string; // sha256(userId + OPENAI_USER_HASH_SALT) hex

// llm-client.ts — provider seam (OpenAI only in MVP)
export interface LlmClient { extract(...): Promise<...>; streamChat(...): AsyncIterable<...> }

// token-count.ts
export function countTokens(text: string): number; // js-tiktoken o200k_base, encoder cached

// pricing.ts
export function calculateCostUsd(promptTokens: number, completionTokens: number): number; // 6 dp

// usage-log.ts  (server-only)
export type AiUsageEntry = { userId: string; contractId: string | null; operation: 'extraction' | 'extraction_repair' | 'chat';
  model: string; promptVersion: string; promptTokens: number; completionTokens: number; latencyMs: number;
  attempts: number; success: boolean; errorCode?: string | null };
export async function logAiUsage(entry: AiUsageEntry): Promise<void>; // service role; never throws (logs on failure)

// prompts/extraction.v1.ts, prompts/chat.v1.ts
export const PROMPT_VERSION: string;
// prompts/index.ts
export function getExtractionPrompt(version: string): ExtractionPromptModule;
export function getChatPrompt(version: string): ChatPromptModule;

// extraction-schema.ts: ExtractionResultSchema (zod), buildExtractionResponseFormat(requested) (strict json_schema)
// extraction.ts: callExtractionModel({ messages, responseFormat, userId, deadlineAt?, log, client?: OpenAI }), ExtractionError
// post-process-terms.ts, source-verification.ts (uses src/lib/text/match.ts) — see 05-key-term-extraction.md
// chat.ts: buildChatMessages, trimHistoryToBudget, streamChatCompletion({ messages, userId, signal, client?: OpenAI })
// classify-query.ts, citations.ts — see 09-contract-chat.md
// `client?: OpenAI` defaults to getOpenAI(); evals inject a replay client (15-evals.md)

// src/lib/validation/custom-terms.ts: CustomTermNameSchema, normaliseTermName, makeCustomTermsSchema(type)  (04)
// src/lib/glossary.ts: GLOSSARY (14)   src/lib/csv.ts: toCsv, escapeCsvCell (16)
```

### 3.8 PDF modules — `src/lib/pdf/`

```ts
// page-markers.ts
export const PAGE_MARKER_REGEX = /\[PAGE (\d+)\]/g;
export function pageMarker(n: number): string;                       // `[PAGE ${n}]`
export function splitPages(text: string): { page: number; text: string }[];
export function pageAtOffset(text: string, offset: number): number | null; // nearest preceding marker

// validate-pdf.ts
export function assertPdfBuffer(buf: Buffer): void; // magic bytes '%PDF-' and size ≤ MAX_FILE_BYTES, else PayloadError

// extract-text.ts (server-only)
export async function extractPdfText(buf: Buffer): Promise<{ text: string; pageCount: number; wordCount: number }>;
```

### 3.9 Services — `src/server/services/` (all `import '@/lib/server-guard'`, see §3.11)

| File | Exports |
|---|---|
| `contracts.service.ts` | `createContract`, `extractContractText`, `getContractDetail`, `getContractStatus`, `listContracts`, `updateContract`, `deleteContract`, `applyProcessingTimeout` |
| `extraction.service.ts` | `startProcessing`, `runExtraction(contractId, userId, opts?: { deadlineAt?: number /* absolute epoch ms; set = sync mode */; requestId?: string; log?: Logger }): Promise<{ status: 'completed' } \| { status: 'error'; error: { code: ContractErrorCode; message: string } } \| { status: 'skipped' }>` (never throws for AI errors) |
| `key-terms.service.ts` | `updateKeyTerm` |
| `chat.service.ts` | `getChatHistory`, `getOrCreateChatSession`, `streamChatAnswer` |
| `feedback.service.ts` | `upsertFeedback` |
| `dashboard.service.ts` | `getDashboardSummary` |
| `account.service.ts` | `updateProfile`, `deleteAccount` |
| `retention.service.ts` | `runRetention` |
| `usage.service.ts` | `runCostBudgetCheck`, `runCorrectionRateCheck` (called by `runRetention`; see `12-rate-limiting-usage.md`) |
| `export.service.ts` *(Phase 2)* | `buildCsv`, `buildPdfReport` |

**Service-role (admin client) uses — the complete list.** Any other use needs a spec change.

1. `contracts` server-managed columns: `/extract` (text, counts, status), `/process` (status transition, attempts, rollback), the `/status` and `GET /contracts/{id}` lazy timeout, `runExtraction` error writes, retention `file_path = null` / `file_deleted_at`. Retention also deletes abandoned `pending_upload` rows older than 24 h.
2. `save_extraction_results` RPC.
3. `chat_messages` rows with `role = 'assistant'`.
4. `ai_usage_logs` inserts (`logAiUsage`) and reads (`usage.service.ts` cost check); `term_correction_rate_7d` and the cost views.
5. `check_rate_limit` RPC. Pruning `rate_limits`.
6. Storage: downloading the object in `/extract`; listing user and contract folders and removing objects in the retention job (expired PDFs, abandoned uploads, orphaned objects) and account deletion. Contract deletion removes its object with the **user-scoped** client (Storage RLS applies).
7. `auth.admin.deleteUser` (account deletion).

Before any service-role write on a contract, the code must have loaded that contract with the **user-scoped** client (RLS proves ownership) or must filter on `id` **and** `user_id`. Before any service-role Storage call, the code asserts that `file_path` starts with `${user_id}/${contract_id}/`.

### 3.10 Client state

```ts
// src/stores/useResultsViewerStore.ts (Zustand)
type ResultsViewerState = {
  targetPage: number | null; scrollRequestId: number;     // bump to re-scroll to the same page
  highlightTermId: string | null; highlightText: string | null;
  zoom: number;                                            // 0.5 – 2.0, step 0.25, default 1
  viewerMode: 'pdf' | 'text';
  activeTab: 'terms' | 'chat';
  goToPage(page: number, opts?: { termId?: string; text?: string | null }): void;
  setZoom(z: number): void; setViewerMode(m: 'pdf' | 'text'): void; setActiveTab(t: 'terms' | 'chat'): void;
  reset(): void;
};
// src/stores/useUploadWizardStore.ts (Zustand)
type UploadWizardState = {
  step: 'select' | 'uploading' | 'extracting' | 'ready' | 'processing';
  contractType: ContractType | null; file: File | null; contractId: string | null;
  uploadProgress: number; pageCount: number | null; customTerms: string[]; error: { code: string; message: string } | null;
  /* setters + reset() */
};
```

**TanStack Query keys** (`src/lib/query-keys.ts`):

```ts
export const qk = {
  dashboardSummary: () => ['dashboard-summary'] as const,
  contracts: (p: ListContractsQuery) => ['contracts', p] as const,
  contract: (id: string) => ['contract', id] as const,
  contractStatus: (id: string) => ['contract-status', id] as const,
  chat: (contractId: string) => ['chat', contractId] as const,
  profile: () => ['profile'] as const,
};
```

**Hooks** (`src/hooks/`): `useDashboardSummary`, `useContracts`, `useContract`, `useContractStatus`, `useUploadContract`, `useProcessContract`, `useUpdateKeyTerm`, `useMarkReviewComplete`, `useDeleteContract`, `useChat`, `useSubmitFeedback`, `useUpdateProfile`, `useMediaQuery`, `usePrefersReducedMotion`, `useRouteFocus`, `useAnnouncer`.

### 3.11 Server-only modules: `server-only` vs `server-guard`

The npm `server-only` package throws outside Next.js's `react-server` condition, which would crash `netlify/functions/*` and `evals/`. So:

- Modules reachable from Netlify functions or evals (all of `src/server/services/*`, `src/lib/env.ts`, `src/lib/supabase/admin.ts`, `src/lib/ai/{openai-client,usage-log,pricing,extraction,chat}.ts`, `src/lib/pdf/extract-text.ts`, `src/lib/api/internal-auth.ts`) use `import '@/lib/server-guard'`, a runtime `typeof window` check.
- Next-only modules (`src/lib/supabase/server.ts`, `src/lib/api/{with-api-handler,require-user,parse,sse,rate-limit}.ts`) keep `import 'server-only'`.
- Build-time protection comes from the ESLint rule `local/no-server-in-client` and `scripts/check-admin-imports.mjs` (`00-foundation.md` §6.12).

---

## 4. Error code catalog

`appError(code)` builds errors from this table (`src/lib/api/error-catalog.ts`). User messages are shown verbatim in the UI.

| Code | HTTP | Retryable | User message |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | no | "Please check the highlighted fields." |
| `UNAUTHORIZED` | 401 | no | "Please sign in to continue." |
| `FORBIDDEN` | 403 | no | "You don't have access to this." |
| `NOT_FOUND` | 404 | no | "We couldn't find that contract." |
| `INVALID_STATUS` | 409 | no | "This contract isn't ready for that action yet." |
| `ALREADY_PROCESSING` | 409 | no | "This contract is already being analysed." |
| `MAX_ATTEMPTS` | 409 | no | "This contract has failed too many times. Please upload it again." |
| `CONTRACT_NOT_READY` | 409 | no | "Chat is available once the analysis is complete." |
| `FILE_TOO_LARGE` | 413 | no | "Please upload a PDF under 10 MB." |
| `NOT_A_PDF` | 422 | no | "Please upload a PDF under 10 MB." |
| `PDF_ENCRYPTED` | 422 | no | "We couldn't read this PDF. It may be password-protected or corrupted." |
| `PDF_UNREADABLE` | 422 | no | "We couldn't read this PDF. It may be password-protected or corrupted." |
| `TOO_MANY_PAGES` | 422 | no | "This contract has {page_count} pages. ContractIQ currently supports up to 20 pages." |
| `SCANNED_PDF` | 422 | no | "Scanned PDFs are not supported yet. Please upload a PDF with selectable text." |
| `CONTRACT_TOO_LONG` | 422 | no | "This contract is too long for ContractIQ right now (max ~15,000 tokens). Longer contract support is coming." |
| `RATE_LIMITED` | 429 | yes | "You're doing that a lot — please wait {retry_after} seconds and try again." |
| `INTERNAL_ERROR` | 500 | yes | "Something went wrong on our side. Please try again." |
| `STORAGE_UNAVAILABLE` | 502 | yes | "We couldn't reach file storage. Please try again in a few minutes." |
| `JOB_DISPATCH_FAILED` | 502 | yes | "We couldn't start the analysis. Please try again." |
| `UPSTREAM_UNAVAILABLE` | 502 | yes | "Our AI provider is unavailable. Try again in a few minutes." |
| `UPSTREAM_TIMEOUT` | 504 | yes | "This is taking longer than expected. Please try again." |

**Client-only codes** (created in the browser, never returned by the server):

| Code | Where | User message |
|---|---|---|
| `NETWORK_ERROR` | `apiFetch` when `fetch` itself fails | "Network error — check your connection and try again." |
| `UPLOAD_FAILED` | `useUploadContract` when the Storage upload fails for any reason other than size or type | "We couldn't upload your file. Check your connection and try again." |

**Contract `error_code` values** (stored on `contracts`, shown on the processing error card; all retryable through `/process`):

| `error_code` | Set by | User message (`error_message`) |
|---|---|---|
| `OPENAI_UNAVAILABLE` | `runExtraction` after retries are exhausted | "We couldn't analyse your contract right now. Try again in a few minutes." |
| `INVALID_AI_OUTPUT` | `runExtraction` after the repair retry fails | same |
| `PROCESSING_TIMEOUT` | lazy timeout (> 120 s in `processing`) | same |
| `SYNC_BUDGET_EXCEEDED` | `runExtraction` in sync mode | same |
| `INTERNAL_ERROR` | `runExtraction` unexpected exception | same |

---

## 5. Cross-cutting rules

- **Design system:** all UI uses `docs/design.md` tokens through Tailwind (see `00-foundation.md` §9). No hex values, no arbitrary pixel values, and Inter Display is the only font. `/design-system` applies to every frontend file in Stage 4.
- **Server Components by default.** Add `"use client"` only to interactive leaves.
- **Every route handler** is `export const runtime = 'nodejs'`, wrapped in `withApiHandler`, calls `requireUser()` first (except `/api/health`), validates with Zod, and returns 404 (never 403) for resources the user doesn't own.
- **No PII in logs:** log `user_id` and `contract_id` only. Never contract text, terms, chat content or emails.
- **Accessibility:** every interactive component meets `14-onboarding-a11y.md` §3.
- **Tests** live under `tests/` and mirror `src/` paths (see each spec's Tests section and `00-foundation.md` §12).

---

## 6. Where the specs deviate from or extend the engineering doc

The engineering doc stays the approved reference. These are the places where implementing it exactly would break a stated constraint, or where the specs add detail the doc left open. Each one is explained in the spec named.

| # | Topic | Engineering doc | Specs | Why | Spec |
|---|---|---|---|---|---|
| 1 | Chat stream timeout | 45 s total stream (§8.1) | `CHAT_STREAM_TIMEOUT_MS = 24_000` | Netlify synchronous functions stop at 26 s, so 45 s can never be reached | 09 §6.12 |
| 2 | Chat history window | "up to 200 messages, ascending" | The **newest** 200, returned in ascending order | Taking the first 200 ascending would drop the most recent turns in long chats | 09 |
| 3 | Contract column guard | `BEFORE UPDATE` guard on the columns listed in §7.4 | Also guards `type_mismatch`, `file_path`, `file_deleted_at`, `file_size_bytes` and `contract_type`, and fires on **INSERT** too (a new row must be an empty `pending_upload` row whose `file_path` sits under `{user_id}/{id}/`) | Without this, a user could point `file_path` at another user's object before a service-role Storage call, or insert a "completed" contract with arbitrary text and skip the token limit. RLS policies are unchanged | schema §5.3 |
| 4 | `profiles.plan` protection | `REVOKE UPDATE (plan, trial_ends_at)` | `REVOKE UPDATE` on the table, then `GRANT UPDATE (full_name, feedback_opt_in, onboarding_completed_at)` | In Postgres a column-level REVOKE does nothing while a table-level grant exists. Same intent, working mechanism (also applied to `key_terms`) | schema §6.1 |
| 5 | `key_terms.edited_at` | Set on the first edit | Updated on **every** edit; `original_*` still set only on the first edit | Keeps the correction-rate window accurate | schema §5.5 |
| 6 | `runExtraction` deadline | `{ deadlineMs }` | `{ deadlineAt }` (absolute epoch ms) | Matches `withRetry`'s `deadlineAt` and avoids recomputing elapsed time | 05 §6.2 |
| 7 | Response extras | §9.2 / §9.6 field lists | `GET /api/contracts/{id}` adds `contract.processing_stage`, `contract.processing_attempts`, `contract.error`, `feedback.accuracy_rating`. Dashboard `recent[]` adds `review_completed_at` | Needed by the retry button, the error card, feedback prefill and the "Reviewed" pill | 06, 10 |
| 8 | `PATCH /api/contracts/{id}` | No rate limit listed | `edit` bucket | Every write route is rate limited | 06 |
| 9 | "Restore AI value" | Not in the doc | Button on the Edited badge that sets the value back to `original_value` (stays marked as edited) | Low-cost undo for corrections | 08 |
| 10 | Auth callback | `?code=` | Also accepts `?token_hash=&type=` (`verifyOtp`) | Lets verification links work on a different device from sign-up | 01 |
| 11 | Orphaned Storage objects | "Caught by the retention sweep" | Explicit orphan sweep step in `runRetention` | The doc names the sweep but doesn't define it | 13 §6.5 |
| 12 | Design tokens for contrast | `docs/design.md` values | Warning text uses Yellow 900 (not 800), form borders use Grey 300, placeholders use Grey 400, page padding is responsive below 1280 px | Yellow 800 on white is about 4.1:1, which fails WCAG 2.1 AA | 00 §9, 14 §3 |
| 13 | CI end-to-end mode | — | E2E runs with `PROCESSING_MODE=sync` against a mock OpenAI server (`OPENAI_BASE_URL`) | `next start` has no Netlify background runtime | 00 §12 |
| 15 | PDF text extraction library | — | `pdfjs-dist` 4.8.69 (the version `react-pdf` uses), loaded lazily on the server, replaces `pdf-parse` 1.1.1 | Found in F5 hosted testing: `pdf-parse`'s bundled 2018 pdf.js intermittently fails (`Command token too long`, `bad XRef entry`) on a PDF parsed after another one in the same process, so a warm server would reject valid uploads as `PDF_UNREADABLE`. `pdfjs-dist` passes the same sequence. Output format (`[PAGE N]` markers, limits, error codes) is unchanged | 03 §6.3 |
| 14 | Monthly cost query | — | `usage.service.ts` pages through `ai_usage_logs` 1,000 rows at a time | PostgREST has no aggregates by default. A SQL function is the upgrade path past ~50k calls/month | 12 |
| 16 | `PATCH /api/contracts/{id}` vs spec 12 | — | Stays rate limited (`edit` bucket, checked after validation) although 12 §5 lists it as not limited | Specs 06 and 12 disagreed; decided in the F14 completion step (2026-10-10) to keep 06's limit, since every other write route is limited. 12 §5's table is superseded on this row (see also #8) | 06, 12 |
| 17 | Mutation retries | — | Mutations never retry automatically (`mutations: { retry: false }` in `QueryProvider`), instead of 12 §7's `retry: (count, err) => err.status !== 429 && count < 1` | Uploads, processing, edits, feedback and deletes are writes; a silent automatic retry after a timeout could repeat a write the server already applied. Errors show a toast or inline message with a manual Retry instead. Decided in the F14 completion step (2026-10-10) | 00, 12 |

**Ops items with no environment variable** (configured in dashboards, tracked for Stage 6):
- **Supabase Auth:** set custom SMTP before beta (01). Email confirmation on, site URL and redirect URLs set.
- **Netlify:**
  - Raise the function timeout to 26 s (00 §6.14).
  - Background Functions need a plan that includes them.
  - Log drain to Slack.
- **Legal:** `/terms` and `/privacy` are placeholders until the legal review supplies their content (02).
- **CI (Phase 2 / evals):**
  - Private dataset repository `contractiq-eval-data`, accessed with the `EVAL_DATA_DEPLOY_KEY` secret.
  - Repository variable `EVAL_GATE_STAGE` (`beta` | `launch`) selects the eval thresholds (15).
  - GitHub secret `OPENAI_API_KEY_EVAL` for the live-API eval smoke job (00 §12, 15).

---

## 7. Known, accepted gaps

Product decisions not to fix something for now. Each entry records what fails, why it's accepted, and how to fix it later.

| # | Gap | Impact | Accepted because | Fix when needed | Logged |
|---|---|---|---|---|---|
| G1 | **Cross-browser confirmation link fails at `/auth/callback` with `pkce_code_verifier_not_found`.** The hosted project uses Supabase's default "Confirm signup" email, which redirects with `?code=` (PKCE). The code verifier lives only in the browser that signed up, so opening the email in another browser or mail app fails the exchange. Observed in F3 hosted testing (2026-10-10). | Supabase has already confirmed the email at its verify step, but our callback sends the user to `/login?error=verification_failed` ("link is invalid or has expired"). The user can sign in normally from there. | Changing the email template (and custom SMTP) is outside what this lab needs. The confirmed-email message improvement is deferred for the same reason. | Set Authentication → Emails → "Confirm signup" to the `token_hash` template in `01-auth.md` §4.2. Optionally have the callback map `pkce_code_verifier_not_found` to a "Your email is confirmed — sign in to continue" banner. | F3 |
