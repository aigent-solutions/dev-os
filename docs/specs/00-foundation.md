# 00 — Foundation

**Engineering-doc refs:** §1.6 (D1–D9), §5 (Frontend Architecture), §6.1–§6.5 (Backend), §7 (Database), §11 (Folder Structure), §12 (Naming), §13 (Testing). Feature **F1** (project foundation & schema).
**Shared contract:** `docs/specs/README.md` §3–§5. This spec *implements* that contract. Every other spec depends on this one.
**Depends on:** a Supabase project, a Netlify site, an OpenAI project key.

---

## 1. Overview

This spec builds the skeleton that every feature plugs into:

- Next.js 14 App Router project (TypeScript strict) with the folder layout from engineering-doc §11.
- Environment validation (`src/lib/env.ts`, `src/lib/env.public.ts`).
- The three Supabase clients, session-refresh middleware and route protection.
- The API layer: `withApiHandler`, `AppError` classes and error catalog, `parse*` helpers, `requireUser`, `enforceRateLimit` *(the implementation itself is in `12-rate-limiting-usage.md`)*, `internal-auth`, `sse`.
- Shared utilities: logger, `withRetry`, `cn`/`slugify`/`safeFileName`, constants, domain types, query keys, the browser `apiFetch` client.
- The design system wired into Tailwind (`tokens.css` + `tailwind.config.ts`), Inter Display, and UI primitives in `src/components/ui/`.
- Root layout, providers, `error.tsx` and `not-found.tsx`.
- Security headers and CSP, `netlify.toml`, `GET /api/health`.
- Local Supabase, migrations, type generation, seed users and the CI workflow.

**Out of scope here:** feature routes, pages and components. Those are in specs 01–16.

---

## 2. User flow

None. This spec has no user-facing flow. The only user-visible surfaces are:

1. Any unexpected render error → `src/app/error.tsx` ("Something went wrong" + **Try again**).
2. Any unknown URL, or a resource the user doesn't own → `src/app/not-found.tsx`.
3. An unauthenticated visit to `/dashboard`, `/contracts/*` or `/settings` → redirect to `/login?next=<path>` (middleware, §6.4).
4. Uptime Robot calls `GET /api/health` every 5 minutes.

---

## 3. Database

| Item | Detail |
|---|---|
| Schema source | `docs/specs/supabase-schema.sql` (the whole schema: 9 tables, triggers, RLS, RPCs, views, Storage bucket and policies) |
| Migration | Copied verbatim to `supabase/migrations/20261012000000_initial_schema.sql`. Later changes are **new** timestamped migrations. Never edit the initial migration after it has been applied anywhere |
| Generated types | `src/types/database.types.ts` (§4.3) |
| Tables read by this spec | `profiles` — read only by `GET /api/health` (anon client, see §5) to prove the database is reachable |

**Which client to use** (applies to every spec):

| Client | Role in Postgres | Used for |
|---|---|---|
| `createBrowserSupabase()` | `authenticated` (or `anon` before sign-in) | Auth calls (`signUp`, `signInWithPassword`, `signOut`, `resend`), Storage upload to the user's own folder |
| `createServerSupabase()` | `authenticated` | **Default** in server components and route handlers. Every query is RLS-filtered to `auth.uid()` |
| `createAdminSupabase()` | `service_role` (bypasses RLS) | **Only** the allowlist in README §3.9. Enforced by `scripts/check-admin-imports.mjs` (§6.12) |

---

## 4. Database tasks

### 4.1 Apply the schema

- **Hosted project:** paste `docs/specs/supabase-schema.sql` into Supabase Dashboard → SQL Editor → Run. Re-running it is safe (idempotent).
- **Local:** `supabase start` applies everything in `supabase/migrations/` automatically. `npm run db:reset` re-applies migrations and the seed.

### 4.2 Verify RLS (run after every schema change; CI runs it too)

```sql
-- expect 0 rows: every public table has RLS enabled and ≥ 1 policy
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (not c.relrowsecurity
       or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname));

-- expect 0 rows: server-only tables have no privileges for API roles
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('rate_limits', 'ai_usage_logs')
  and grantee in ('anon', 'authenticated');
```

Saved as `scripts/sql/verify-rls.sql`. `scripts/verify-rls.sh` runs both queries with `psql "$DB_URL" -v ON_ERROR_STOP=1 -At` and exits 1 if either returns any rows.

### 4.3 Type generation

| Script | Command |
|---|---|
| `db:types` | `supabase gen types typescript --local > src/types/database.types.ts` |
| `db:types:remote` | `supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/types/database.types.ts` |

CI regenerates the types against the local stack and fails if `git diff --exit-code src/types/database.types.ts` shows a difference.

### 4.4 Seed data (local and CI only)

`supabase/seed.sql` stays **empty of users**, because inserting directly into `auth.users` bypasses GoTrue. Test users are created by `tests/setup/seed-users.ts` through the admin API:

```ts
export const SEED_USERS = {
  alice: { email: 'alice@contractiq.test', password: 'Password123' },
  bob:   { email: 'bob@contractiq.test',   password: 'Password123' },
} as const;
// For each user: admin.auth.admin.createUser({ email, password, email_confirm: true }).
// If the user already exists (error.status 422), look it up with listUsers and reuse it.
// Returns { alice: { id, email, password }, bob: { ... } }.
// The handle_new_user trigger creates the profiles rows.
```

Used by the Vitest integration `globalSetup` and the Playwright `globalSetup`.

---

## 5. API routes

### `GET /api/health`

| Field | Value |
|---|---|
| File | `src/app/api/health/route.ts` |
| Purpose | Uptime monitoring (Uptime Robot, every 5 min) and the frontend maintenance banner |
| Auth | **Public.** Not wrapped in `requireUser`. Excluded from the middleware matcher |
| Runtime | `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` |
| Request | none |
| Logic | 1. Create a **cookie-less anon** client: `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })`. 2. `await client.from('profiles').select('id').limit(1)` with a 3 s `AbortSignal.timeout(3000)` (`.abortSignal(signal)`). RLS returns `[]` for anon, but **success proves PostgREST and Postgres are up**. The service role is not used (not in the README §3.9 allowlist). 3. `error` or timeout → degraded |
| Response `200` | `{ "status": "ok", "db": "ok", "version": "<COMMIT_REF>" }` |
| Response `503` | `{ "status": "degraded", "db": "error", "version": "<COMMIT_REF>" }` |
| Headers | `Cache-Control: no-store` |
| Errors | None beyond the 503 (never throws; all exceptions map to 503) |

### Client-side maintenance banner

`MaintenanceBanner` (`src/components/layout/MaintenanceBanner.tsx`, client) is rendered in `(app)/layout.tsx`:

- Uses `useQuery({ queryKey: ['health'], queryFn: () => fetch('/api/health').then(r => r.status), refetchInterval: 60_000, retry: false })`.
- Shows a warning `Banner` with the text "ContractIQ is having trouble reaching its database. Some actions may fail — we're on it." when the status is `503` **or** the fetch rejects.
- Hidden otherwise.

---

## 6. Backend implementation

### 6.1 Project scaffold

```bash
npx create-next-app@14 contractiq --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
```

**Runtime dependencies.** These are minimum versions. The lockfile pins exact versions. Stay on Next.js 14 and React 18 (fixed by the engineering doc).

| Package | Version | Purpose |
|---|---|---|
| `next` | `^14.2.15` | Framework (App Router) |
| `react`, `react-dom` | `^18.3.1` | UI |
| `@supabase/supabase-js` | `^2.45.0` | Supabase client |
| `@supabase/ssr` | `^0.5.1` | Cookie-based auth for App Router |
| `zod` | `^3.23.8` | Validation (shared client/server) |
| `@tanstack/react-query` | `^5.59.0` | Server state |
| `zustand` | `^5.0.0` | Client UI state |
| `react-hook-form` | `^7.53.0` | Forms |
| `@hookform/resolvers` | `^3.9.0` | Zod resolver |
| `@radix-ui/react-dialog`, `-tooltip`, `-tabs`, `-collapsible`, `-dropdown-menu`, `-toast`, `-select`, `-popover`, `-label`, `-slot`, `-visually-hidden`, `-progress` | `^1.1.0` (`react-select` `^2.1.0`) | Accessible primitives |
| `lucide-react` | `^0.446.0` | Icons |
| `react-pdf` | `^9.1.1` | PDF.js React wrapper (brings in `pdfjs-dist` 4.x) |
| `pdfjs-dist` | match the version `react-pdf` depends on | Worker file copied to `public/` |
| `pdf-parse` | `^1.1.1` | Server-side text extraction |
| `js-tiktoken` | `^1.0.15` | Token counting (`o200k_base`) |
| `openai` | `^4.67.0` | OpenAI SDK |
| `nanoid` | `^5.0.7` | Request IDs |
| `date-fns` | `^4.1.0` | Date formatting |
| `clsx` | `^2.1.1` | Class composition |
| `tailwind-merge` | `^2.5.2` | Tailwind class merging (v2 targets Tailwind 3) |
| `react-dropzone` | `^14.2.9` | Upload dropzone |
| `server-only` | `^0.0.1` | Build-time guard for **Next-only** server modules (see §6.12 for `server-guard`) |
| `react-resizable-panels` | `^2.1.4` | Resizable 60/40 results layout (`06-results-key-terms-panel.md`) |
| `@netlify/functions` | `^2.8.2` | Types for `netlify/functions/*.mts` |

**Dev dependencies**

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.6.0` | |
| `@types/node` (`^20`), `@types/react` (`^18`), `@types/react-dom` (`^18`), `@types/pdf-parse` | latest matching | |
| `tailwindcss` | `^3.4.13` | Styling |
| `postcss`, `autoprefixer` | `^8.4`, `^10.4` | |
| `eslint`, `eslint-config-next` | `^8.57`, `^14.2.15` | Lint |
| `vitest` | `^2.1.2` | Unit and integration |
| `@vitest/coverage-v8` | `^2.1.2` | Coverage |
| `@testing-library/react` | `^16.0.1` | Component tests |
| `@testing-library/user-event` | `^14.5.2` | |
| `@testing-library/jest-dom` | `^6.5.0` | |
| `jsdom` | `^25.0.1` | DOM env |
| `msw` | `^2.4.9` | OpenAI mocks in unit/integration |
| `@playwright/test` | `^1.48.0` | E2E |
| `@axe-core/playwright` | `^4.10.0` | Accessibility checks |
| `tsx` | `^4.19.1` | Running evals and scripts |
| `supabase` | `^2.0.0` | Supabase CLI (local stack, type generation) |
| `@netlify/plugin-nextjs` | `^5.7.0` | Netlify Next.js runtime |
| `netlify-cli` | `^17.36.0` | `netlify dev` (runs Next + functions locally on :8888) |

**`package.json` scripts**

```json
{
  "dev": "netlify dev",
  "dev:next": "next dev -p 3000",
  "build": "next build",
  "start": "next start -p 3000",
  "lint": "next lint && node scripts/check-no-hex.mjs && node scripts/check-admin-imports.mjs",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --project unit",
  "test:unit": "vitest run --project unit --coverage",
  "test:integration": "vitest run --project integration",
  "test:e2e": "playwright test",
  "db:start": "supabase start",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > src/types/database.types.ts",
  "db:verify-rls": "bash scripts/verify-rls.sh",
  "eval:extraction": "tsx evals/run-extraction-eval.ts",
  "eval:calibration": "tsx evals/run-calibration-eval.ts",
  "eval:chat": "tsx evals/run-chat-groundedness.ts",
  "postinstall": "node scripts/copy-pdf-worker.mjs",
  "prebuild": "node scripts/copy-pdf-worker.mjs"
}
```

`scripts/copy-pdf-worker.mjs` copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` (resolved through `require.resolve('pdfjs-dist/package.json')`, so it's the same version `react-pdf` uses) to `public/pdf.worker.min.mjs`. `public/pdf.worker.min.mjs` is git-ignored.

**`tsconfig.json`** (changes from the default):

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", "netlify/**/*.mts", "tests/**/*.ts", "evals/**/*.ts", ".next/types/**/*.ts"]
}
```

### 6.2 Environment — `src/lib/env.ts`, `src/lib/env.public.ts`

Both use Zod and are parsed once at module load. A failure throws `Error('Invalid environment: <field>: <message>, …')`, so the build or boot fails loudly.

```ts
// src/lib/env.public.ts — safe for client bundles (no server-only import)
const bool = (def: boolean) =>
  z.enum(['true', 'false']).optional().transform(v => (v === undefined ? def : v === 'true'));

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().transform(u => u.replace(/\/$/, '')),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SHOW_CALIBRATION_WARNING: bool(false),
});
// Each NEXT_PUBLIC_* var must be referenced literally (process.env.NEXT_PUBLIC_APP_URL),
// because Next.js inlines them at build time; object spread of process.env does not work client-side.
export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SHOW_CALIBRATION_WARNING: process.env.NEXT_PUBLIC_SHOW_CALIBRATION_WARNING || undefined,
});
```

```ts
// src/lib/env.ts
import '@/lib/server-guard'; // not 'server-only': env is loaded by Netlify functions and evals (§6.12)
const num = (def: number, min = 0) => z.coerce.number().min(min).optional().transform(v => v ?? def);
const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  OPENAI_EXTRACTION_MODEL: z.string().min(1).default('gpt-4o'),
  OPENAI_CHAT_MODEL: z.string().min(1).default('gpt-4o'),
  OPENAI_PRICE_INPUT_PER_MTOK: z.coerce.number().positive(),
  OPENAI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().positive(),
  OPENAI_USER_HASH_SALT: z.string().min(32),
  OPENAI_MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  EXTRACTION_PROMPT_VERSION: z.string().default('extraction-v1.0'),
  CHAT_PROMPT_VERSION: z.string().default('chat-v1.0'),
  CHAT_MAX_INPUT_TOKENS: num(100_000, 1_000),
  PROCESSING_MODE: z.enum(['background', 'sync']).default('background'),
  PROCESSING_SYNC_FALLBACK: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  SYNC_PROCESSING_BUDGET_MS: num(24_000, 5_000),
  INTERNAL_FUNCTION_SECRET: z.string().min(32),
  SITE_URL: z.string().url().transform(u => u.replace(/\/$/, '')),
  COMMIT_REF: z.string().default('dev'),
});
export const serverEnv = ServerEnvSchema.parse({
  ...emptyToUndefined(process.env),   // '' → undefined so defaults apply
  SITE_URL: process.env.URL || process.env.NEXT_PUBLIC_APP_URL,
});
```

`emptyToUndefined` maps empty-string values to `undefined`, so a blank line copied from `.env.example` falls back to the default. In Vitest, `tests/setup/env.ts` sets a complete fake env before any import.

### 6.3 Supabase clients — `src/lib/supabase/`

```ts
// client.ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
let browserClient: SupabaseClient<Database> | undefined;
export function createBrowserSupabase() {
  return (browserClient ??= createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

// server.ts
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component: middleware refreshes cookies instead */ }
      },
    },
  });
}

// admin.ts
import '@/lib/server-guard'; // loaded by Netlify functions (§6.12)
import { createClient } from '@supabase/supabase-js';
let adminClient: SupabaseClient<Database> | undefined;
export function createAdminSupabase() {
  return (adminClient ??= createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

// middleware.ts (lib)
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(URL, ANON, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser(); // validates with the Auth server
  return { response, user: user && user.email_confirmed_at ? user : null };
}
```

Rule: never put code between `createServerClient` and `auth.getUser()` in `updateSession` (Supabase SSR requirement). Redirect responses must copy the cookies from `response` (§6.4).

### 6.4 Root middleware — `middleware.ts`

```ts
const PROTECTED_PREFIXES = ['/dashboard', '/contracts', '/settings'];
const AUTH_ONLY_PUBLIC = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) return response; // API routes answer 401 JSON themselves

  const isProtected = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectWithCookies(url, response);
  }
  if (user && (pathname === '/' || AUTH_ONLY_PUBLIC.includes(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return redirectWithCookies(url, response);
  }
  return response;
}
// redirectWithCookies: NextResponse.redirect(url) + copy every cookie from `response`.

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts/|pdf\\.worker\\.min\\.mjs|demo\\.gif|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2)$).*)',
  ],
};
```

- `/auth/callback` and `/verify-email` go through the middleware (session refresh) but are neither protected nor redirected.
- `/` is statically generated. Redirecting signed-in users happens in middleware, so the page stays static.

### 6.5 Error catalog and errors — `src/lib/api/error-catalog.ts`, `src/lib/api/errors.ts`

```ts
// error-catalog.ts — values exactly as README §4
export const ERROR_CATALOG = {
  VALIDATION_ERROR:    { status: 400, retryable: false, message: 'Please check the highlighted fields.' },
  UNAUTHORIZED:        { status: 401, retryable: false, message: 'Please sign in to continue.' },
  FORBIDDEN:           { status: 403, retryable: false, message: "You don't have access to this." },
  NOT_FOUND:           { status: 404, retryable: false, message: "We couldn't find that contract." },
  INVALID_STATUS:      { status: 409, retryable: false, message: "This contract isn't ready for that action yet." },
  ALREADY_PROCESSING:  { status: 409, retryable: false, message: 'This contract is already being analysed.' },
  MAX_ATTEMPTS:        { status: 409, retryable: false, message: 'This contract has failed too many times. Please upload it again.' },
  CONTRACT_NOT_READY:  { status: 409, retryable: false, message: 'Chat is available once the analysis is complete.' },
  FILE_TOO_LARGE:      { status: 413, retryable: false, message: 'Please upload a PDF under 10 MB.' },
  NOT_A_PDF:           { status: 422, retryable: false, message: 'Please upload a PDF under 10 MB.' },
  PDF_ENCRYPTED:       { status: 422, retryable: false, message: "We couldn't read this PDF. It may be password-protected or corrupted." },
  PDF_UNREADABLE:      { status: 422, retryable: false, message: "We couldn't read this PDF. It may be password-protected or corrupted." },
  TOO_MANY_PAGES:      { status: 422, retryable: false, message: 'This contract has {page_count} pages. ContractIQ currently supports up to 20 pages.' },
  SCANNED_PDF:         { status: 422, retryable: false, message: 'Scanned PDFs are not supported yet. Please upload a PDF with selectable text.' },
  CONTRACT_TOO_LONG:   { status: 422, retryable: false, message: 'This contract is too long for ContractIQ right now (max ~15,000 tokens). Longer contract support is coming.' },
  RATE_LIMITED:        { status: 429, retryable: true,  message: "You're doing that a lot — please wait {retry_after} seconds and try again." },
  INTERNAL_ERROR:      { status: 500, retryable: true,  message: 'Something went wrong on our side. Please try again.' },
  STORAGE_UNAVAILABLE: { status: 502, retryable: true,  message: "We couldn't reach file storage. Please try again in a few minutes." },
  JOB_DISPATCH_FAILED: { status: 502, retryable: true,  message: "We couldn't start the analysis. Please try again." },
  UPSTREAM_UNAVAILABLE:{ status: 502, retryable: true,  message: 'Our AI provider is unavailable. Try again in a few minutes.' },
  UPSTREAM_TIMEOUT:    { status: 504, retryable: true,  message: 'This is taking longer than expected. Please try again.' },
} as const;
export type ErrorCode = keyof typeof ERROR_CATALOG;

// Contract-level error codes (stored in contracts.error_code), README §4 second table
export const CONTRACT_ERROR_CODES = ['OPENAI_UNAVAILABLE', 'INVALID_AI_OUTPUT', 'PROCESSING_TIMEOUT', 'SYNC_BUDGET_EXCEEDED', 'INTERNAL_ERROR'] as const;
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];
export const CONTRACT_ERROR_MESSAGE = "We couldn't analyse your contract right now. Try again in a few minutes.";
```

`errors.ts` contains the classes from README §3.3, plus:

```ts
export function interpolate(template: string, details?: Record<string, unknown>): string;
// replaces {key} with String(details[key]); leaves unknown placeholders untouched

export function appError(code: ErrorCode, details?: Record<string, unknown>): AppError {
  const e = ERROR_CATALOG[code];
  const msg = interpolate(e.message, details);
  switch (e.status) {
    case 400: return new ValidationError(code, 400, msg, false, details);
    case 401: return new UnauthorizedError(code, 401, msg);
    case 403: return new ForbiddenError(code, 403, msg);
    case 404: return new NotFoundError(code, 404, msg);
    case 409: return new ConflictError(code, 409, msg, false, details);
    case 413: case 422: return new PayloadError(code, e.status, msg, false, details);
    case 429: return new RateLimitError(code, 429, msg, true, details, Number(details?.retry_after ?? 60));
    case 502: return new UpstreamError(code, 502, msg, true, details);
    case 504: return new TimeoutError(code, 504, msg, true, details);
    default:  return new AppError(code, e.status, msg, e.retryable, details);
  }
}

export function toErrorResponse(err: unknown, requestId: string): Response {
  const app = err instanceof AppError ? err : appError('INTERNAL_ERROR');
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'x-request-id': requestId };
  if (app instanceof RateLimitError) headers['Retry-After'] = String(app.retryAfterSeconds);
  return Response.json(
    { error: { code: app.code, message: app.userMessage, retryable: app.retryable, details: app.details ?? {} }, request_id: requestId },
    { status: app.status, headers },
  );
}
```

`details` must never contain contract text, chat content or emails. Only counts and field names.

### 6.6 Route wrapper and helpers — `src/lib/api/`

```ts
// with-api-handler.ts
export function withApiHandler<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: ApiContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: { params: P }) => {
    const requestId = 'req_' + nanoid(12);
    const log = logger.child({ request_id: requestId, method: req.method, path: new URL(req.url).pathname });
    const started = performance.now();
    let res: Response;
    try {
      res = await handler(req, { params: ctx.params, requestId, log });
    } catch (err) {
      if (!(err instanceof AppError) || err.status >= 500) log.error('request_failed', { err: serializeError(err) });
      res = toErrorResponse(err, requestId);
    }
    // SSE responses (content-type text/event-stream) are returned as-is apart from x-request-id
    res.headers.set('x-request-id', requestId);
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) res.headers.set('Cache-Control', 'no-store');
    log.info('request_completed', { status: res.status, latency_ms: Math.round(performance.now() - started) });
    return res;
  };
}
// serializeError: { name, message, stack (non-production only), code? } — never request bodies

// require-user.ts
export async function requireUser() {
  const supabase = createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) throw appError('UNAUTHORIZED');
  return { user, supabase };
}

// parse.ts
function toValidationError(e: ZodError) {
  const fe = e.flatten().fieldErrors;
  const details = Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? 'Invalid value']));
  if (e.flatten().formErrors.length) details._form = e.flatten().formErrors[0]!;
  return appError('VALIDATION_ERROR', details);
}
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S) {
  let json: unknown;
  try { json = await req.json(); } catch { throw appError('VALIDATION_ERROR', { _form: 'Body must be valid JSON' }); }
  const r = schema.safeParse(json); if (!r.success) throw toValidationError(r.error); return r.data as z.infer<S>;
}
export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S) {
  const r = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams)); if (!r.success) throw toValidationError(r.error); return r.data;
}
export function parseParams<S extends ZodTypeAny>(params: unknown, schema: S) {
  const r = schema.safeParse(params); if (!r.success) throw appError('NOT_FOUND'); return r.data; // malformed id → 404
}
export const IdParamsSchema = z.object({ id: z.string().uuid() });

// internal-auth.ts (server-only)
export function assertInternalRequest(req: Request) {
  const got = Buffer.from(req.headers.get('x-internal-secret') ?? '');
  const want = Buffer.from(serverEnv.INTERNAL_FUNCTION_SECRET);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw appError('UNAUTHORIZED');
}
export function internalAuthHeaders() { return { 'x-internal-secret': serverEnv.INTERNAL_FUNCTION_SECRET }; }

// sse.ts
export function createSseResponse(run: (send, signal) => Promise<void>): Response {
  const encoder = new TextEncoder(); const controller = new AbortController();
  const stream = new ReadableStream({
    async start(c) {
      const send = (event: string, data: unknown) => c.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const keepAlive = setInterval(() => c.enqueue(encoder.encode(': keep-alive\n\n')), 15_000);
      try { await run(send, controller.signal); } finally { clearInterval(keepAlive); c.close(); }
    },
    cancel() { controller.abort(); }, // client disconnected or pressed Stop
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
```

`rate-limit.ts` (`RATE_LIMITS`, `enforceRateLimit`) is specified in `12-rate-limiting-usage.md`.

**Route handler template** (every feature route follows this shape):

```ts
export const runtime = 'nodejs';
export const PATCH = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { id } = parseParams(params, IdParamsSchema);
  const { user, supabase } = await requireUser();
  await enforceRateLimit(user.id, 'edit');               // when the spec names a bucket
  const body = await parseBody(req, UpdateKeyTermSchema);
  const result = await updateKeyTerm(supabase, user.id, id, body);
  return Response.json(result, { status: 200 });
});
```

### 6.7 Logger — `src/lib/logger.ts`

```ts
type Level = 'info' | 'warn' | 'error';
function write(level: Level, msg: string, base: object, fields?: object) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...base, ...fields });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}
export function createLogger(base: object = {}): Logger {
  return { info: (m, f) => write('info', m, base, f), warn: (m, f) => write('warn', m, base, f),
           error: (m, f) => write('error', m, base, f), child: (f) => createLogger({ ...base, ...f }) };
}
export const logger = createLogger({ service: 'contractiq', version: process.env.COMMIT_REF ?? 'dev' });
```

Allowed fields: `request_id`, `user_id`, `contract_id`, `status`, `latency_ms`, `code`, counts, `mode`. **Forbidden:** contract text, term values, chat content, email addresses, file names, tokens or secrets. Alert hooks (Netlify log drain → Slack) match on `msg` values: `request_failed`, `COST_BUDGET_WARNING`, `PROCESSING_FALLBACK_SYNC`.

### 6.8 Retry — `src/lib/retry.ts`

```ts
export async function withRetry<T>(fn, opts: RetryOptions): Promise<{ result: T; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const remaining = opts.deadlineAt ? opts.deadlineAt - Date.now() : Infinity;
    if (remaining <= 0) break;
    const timeout = typeof opts.perAttemptTimeoutMs === 'function' ? opts.perAttemptTimeoutMs(remaining) : opts.perAttemptTimeoutMs;
    if (timeout <= 0) break;
    try {
      return { result: await fn(attempt, AbortSignal.timeout(timeout)), attempts: attempt };
    } catch (err) {
      lastErr = err;
      const left = opts.deadlineAt ? opts.deadlineAt - Date.now() : Infinity;
      if (attempt === opts.attempts || !opts.isRetryable(err) || left < (opts.minRemainingMsForRetry ?? 0)) throw err;
      let delay = Math.min(opts.maxDelayMs ?? 30_000, opts.baseDelayMs * opts.factor ** (attempt - 1));
      const retryAfter = retryAfterMs(err);              // OpenAI 429 'retry-after' / 'retry-after-ms' headers
      if (retryAfter !== null) delay = Math.max(delay, Math.min(retryAfter, opts.maxDelayMs ?? 30_000));
      if (opts.jitter) delay = Math.round(delay * (0.8 + Math.random() * 0.4));
      if (opts.deadlineAt) delay = Math.min(delay, Math.max(0, opts.deadlineAt - Date.now() - (opts.minRemainingMsForRetry ?? 0)));
      await sleep(delay);
    }
  }
  throw lastErr ?? new TimeoutError('UPSTREAM_TIMEOUT', 504, ERROR_CATALOG.UPSTREAM_TIMEOUT.message, true);
}

export function isRetryableOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) return [429, 500, 502, 503, 504].includes(err.status ?? 0);
  if (err instanceof OpenAI.APIConnectionError || err instanceof OpenAI.APIConnectionTimeoutError) return true;
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  return e?.name === 'AbortError' || e?.name === 'TimeoutError' || ['ETIMEDOUT', 'ECONNRESET'].includes(e?.code ?? e?.cause?.code ?? '');
}
```

Standard presets (exported from `retry.ts`):

```ts
export const BACKGROUND_RETRY = { attempts: 3, baseDelayMs: 1000, factor: 2, jitter: true, maxDelayMs: 8000,
  perAttemptTimeoutMs: OPENAI_TIMEOUT_MS, isRetryable: isRetryableOpenAIError } satisfies RetryOptions;
// Sync preset is built per request in 05-key-term-extraction.md (deadline-bound, 500 ms fixed backoff, factor 1).
```

### 6.9 Utilities, constants, types, query keys

- `src/lib/utils.ts`: `cn`, `slugify`, `safeFileName` as in README §3.4.
  - `slugify(s)`: NFKD-normalise, strip diacritics, lowercase, replace `[^a-z0-9]+` with `_`, trim `_`, cut to 50 characters.
  - `safeFileName(name)`: strip a trailing `.pdf` (case-insensitive), then `slugify`. If empty, use `'contract'`. Cut to 80 characters and append `.pdf`.
  - Also exports `sleep(ms)` and `formatBytes(n)`.
- `src/lib/constants.ts`: exactly README §3.5.
- `src/types/domain.ts`: README §3.6. `confidenceBand(score)` returns `'high'` if `score >= CONFIDENCE_HIGH`, `'medium'` if `score >= CONFIDENCE_LOW`, else `'low'`.
- `src/lib/query-keys.ts`: README §3.10 `qk`.
- `src/types/api.ts`: DTOs. Each feature spec adds its own.

### 6.10 Browser API client — `src/lib/api-client.ts`

Every hook in `src/hooks/` calls the API through this module, never through bare `fetch`. SSE is the exception: chat uses `src/lib/chat/sse-client.ts`.

```ts
export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable: boolean,
              public details: Record<string, unknown>, public requestId: string | null, public retryAfterSeconds: number | null) { super(message); }
}
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { json, timeoutMs = 30_000, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  }).catch((e) => { throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error — check your connection and try again.', true, {}, null, null); });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiClientError(res.status, e.code ?? 'INTERNAL_ERROR', e.message ?? 'Something went wrong on our side. Please try again.',
      e.retryable ?? res.status >= 500, e.details ?? {}, body?.request_id ?? null, Number(res.headers.get('Retry-After')) || null);
  }
  return body as T;
}
```

A `401` from any `apiFetch` call triggers `window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search))`. This is handled once, in `QueryProvider`'s `QueryCache`/`MutationCache` `onError`.

### 6.11 Providers, root layout, error pages

```tsx
// src/components/providers/QueryProvider.tsx ('use client')
const [client] = useState(() => new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && !(err instanceof ApiClientError && err.status > 0 && err.status < 500) },
    mutations: { retry: false },
  },
}));
// handleAuthError(err): if err instanceof ApiClientError && err.status === 401 → redirect to /login?next=…

// src/app/layout.tsx (server)
export const metadata = { title: { default: 'ContractIQ', template: '%s · ContractIQ' },
  description: 'AI-assisted NDA and MSA review for teams without in-house counsel.' };
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={interDisplay.variable}>
      <body className="bg-surface-page font-sans text-body-lg text-fg-primary antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 …">Skip to main content</a>
        <QueryProvider><TooltipProvider delayDuration={300}><ToastProvider>{children}<Toaster /></ToastProvider></TooltipProvider></QueryProvider>
      </body>
    </html>
  );
}
```

Every layout's `<main>` element carries `id="main"`.

- `src/app/error.tsx` (`'use client'`, props `{ error: Error & { digest?: string }; reset: () => void }`): centred `Card` with H5 "Something went wrong", body "An unexpected error occurred. Please try again.", a primary `Button` **Try again** → `reset()`, and a secondary link "Go to dashboard" (`/dashboard`). It logs `console.error(error.digest)`. Focus moves to the heading on mount.
- `src/app/global-error.tsx`: same content, with its own `<html><body>`.
- `src/app/not-found.tsx`: H5 "We couldn't find that page", body "It may have been deleted, or you may not have access to it.", link button "Back to dashboard". It's also used for contracts the user doesn't own (`notFound()` from the results page).
- Each route segment that fetches data has its own `loading.tsx` (defined in the feature specs).

### 6.12 Guard scripts (run by `npm run lint` and CI)

| Script | Rule |
|---|---|
| `scripts/check-admin-imports.mjs` | Lists every file that imports `@/lib/supabase/admin`. Fails if any file is outside the allowlist: `src/server/services/contracts.service.ts`, `src/server/services/extraction.service.ts`, `src/server/services/chat.service.ts`, `src/server/services/account.service.ts`, `src/server/services/retention.service.ts`, `src/server/services/usage.service.ts`, `src/lib/ai/usage-log.ts`, `src/lib/api/rate-limit.ts`, `netlify/functions/*.mts`, `tests/**`, `evals/**`. This implements README §3.9 |
| `scripts/check-no-hex.mjs` | Fails if any `src/**/*.{ts,tsx}` file except `src/styles/tokens.css` contains `/#[0-9a-fA-F]{3,8}\b/` inside a `className`, `style` or a string literal. Also fails on Tailwind arbitrary colours (`/(bg|text|border|fill|stroke|ring)-\[#/`) |
| ESLint `no-restricted-imports` | `openai`, `pdf-parse`, `@/lib/env`, `@/lib/supabase/admin`, `@/lib/server-guard` and anything under `@/server/` cannot be imported from files that start with `'use client'` (custom rule `local/no-server-in-client` in `eslint-rules/`). This is the build-time protection for modules that use `server-guard` |

**`server-only` vs `server-guard`.** The npm `server-only` package throws whenever it is resolved without the `react-server` export condition. Next.js server code has that condition, but Netlify's esbuild bundle (`netlify/functions/*`) and plain-Node scripts (`evals/`) don't, so they would crash on import. Rules:

1. Modules reachable from `netlify/functions/*` or `evals/` use `import '@/lib/server-guard'`. That covers `src/server/services/*`, `src/lib/env.ts`, `src/lib/supabase/admin.ts`, `src/lib/ai/{openai-client,usage-log,extraction,chat}.ts`, `src/lib/pdf/extract-text.ts` and `src/lib/api/internal-auth.ts`.
2. Modules that only Next.js loads keep `import 'server-only'`: `src/lib/supabase/server.ts`, `src/lib/api/{with-api-handler,require-user,parse,sse,rate-limit}.ts`.
3. `src/lib/server-guard.ts`:

```ts
// Runtime guard: throws if a server module is evaluated in a browser bundle.
if (typeof window !== 'undefined') {
  throw new Error('This module is server-only and was imported into client code.');
}
export {};
```

4. Build-time protection for rule-1 modules comes from the ESLint rule above. `scripts/check-admin-imports.mjs` additionally limits who may import the admin client.
5. `netlify functions:invoke process-contract-background` and `retention-cleanup` must load without errors locally (Stage 4 check).

### 6.13 Security headers and Next config — `next.config.mjs`

```js
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;           // e.g. https://abc.supabase.co
const supabaseWs = supabase?.replace(/^https/, 'wss');
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`, // Next 14 inline bootstrap; nonce-based CSP is a Stage 7 item
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabaseWs}`,
  "worker-src 'self' blob:",
  `frame-src 'self' blob: ${supabase}`,   // "Download PDF" opens signed URLs; react-pdf does not use frames
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ['pdf-parse'] },
  webpack: (config) => { config.resolve.alias.canvas = false; return config; }, // react-pdf: no node-canvas
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    ]}];
  },
};
```

### 6.14 Netlify — `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
  NEXT_TELEMETRY_DISABLED = "1"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[dev]
  command = "npm run dev:next"
  targetPort = 3000
  port = 8888
  framework = "#custom"
```

- **Background function:** `netlify/functions/process-contract-background.mts`. The `-background` suffix makes Netlify return `202` immediately and run for up to 15 minutes. Requires a Netlify plan with Background Functions (the PRD budgets Netlify Pro). Full spec in `05-key-term-extraction.md`.
- **Scheduled function:** `netlify/functions/retention-cleanup.mts` with `export const config: Config = { schedule: '0 3 * * *' }`. Full spec in `13-data-lifecycle-gdpr.md`.
- **Synchronous function timeout:** Netlify's default is 10 s. **When `PROCESSING_MODE=sync` is used, or the automatic sync fallback is relied on** (`PROCESSING_SYNC_FALLBACK=true`), the site's synchronous function timeout must be raised to the 26 s maximum (Site configuration → Functions, or a Netlify support request on plans where the UI doesn't expose it). The chat SSE route (≤ 15 s P95) also needs the higher limit for long answers. The deploy checklist (Stage 6) verifies this.
- **Environment variables:** set every variable in `.env.example` (except the Testing group) in Site configuration → Environment variables, for all deploy contexts. `URL`, `DEPLOY_PRIME_URL`, `COMMIT_REF` and `CONTEXT` are provided by Netlify.
- **Log drain:** Netlify log drain → Slack webhook alerting on `request_failed` (≥ 5 per 5 min), `COST_BUDGET_WARNING` and `PROCESSING_FALLBACK_SYNC` (≥ 3 per hour). Configured in the Netlify UI. The app needs no env var for it.

### 6.15 Local development

1. `npm install` (copies the PDF worker).
2. `npm run db:start` → local Supabase. Copy the `API URL`, `anon key` and `service_role key` printed by `supabase status` into `.env.local`.
3. `supabase/config.toml`: `[auth] site_url = "http://localhost:8888"`, `additional_redirect_urls = ["http://localhost:8888/auth/callback"]`, `[auth.email] enable_confirmations = true`, `[auth.email.template.confirmation] subject = "Confirm your ContractIQ account"`, `content_path = "./supabase/templates/confirmation.html"` (template in `01-auth.md` §4).
4. `npm run dev` → `netlify dev` serves Next.js and the functions on `http://localhost:8888`. Auth emails go to the local mail catcher (Mailpit on CLI v2, at `http://localhost:54324`).

---

## 7. State management

| Concern | Implementation |
|---|---|
| Server state | TanStack Query (`QueryProvider`, §6.11). Keys from `src/lib/query-keys.ts` only |
| Client UI state | Zustand stores (`src/stores/`), shapes fixed in README §3.10. Owned by `06`/`07` (viewer) and `03` (wizard) |
| Auth state | Supabase cookies. Server components read the user through `createServerSupabase().auth.getUser()`. No client-side auth store |
| Health | `['health']` query in `MaintenanceBanner` (§5) |

---

## 8. Components

### 8.1 UI primitives — `src/components/ui/`

All primitives forward refs, accept `className` (merged with `cn`), use only design tokens (§9), and meet `14-onboarding-a11y.md` §3.

| Component | File | Props | Behaviour / styling |
|---|---|---|---|
| `Button` | `Button.tsx` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'destructive'` (default `primary`), `size: 'sm' \| 'md'` (default `md`), `loading?: boolean`, `asChild?: boolean` (Radix Slot), native button props | `md`: h-10 px-4, `sm`: h-8 px-3. Radius `md` (6px). Primary: `bg-brand text-fg-inverse hover:bg-brand-hover`. Secondary: `bg-surface border border-border-control text-fg-primary hover:bg-surface-subtle`. Ghost: transparent, `hover:bg-surface-subtle`. Destructive: `bg-danger-solid text-fg-inverse`. `loading`: shows `Spinner`, sets `aria-busy="true"` and `disabled`, keeps the label for screen readers. Disabled: `bg-surface-page text-fg-disabled border-border`. Focus: `focus-visible:ring-2 ring-focus ring-offset-2` |
| `IconButton` | `IconButton.tsx` | `label: string` (required, becomes `aria-label`), `icon: LucideIcon`, `variant`, `size` | Square, 32 or 40 px. The icon is `aria-hidden` |
| `Input` | `Input.tsx` | native input props + `invalid?: boolean` | h-10, px-3, radius `md`, `border-border-control`. Invalid: `border-danger-border bg-danger-bg` and `aria-invalid="true"`. Placeholder `text-fg-placeholder` |
| `Textarea` | `Textarea.tsx` | native + `invalid?`, `autoResize?: boolean`, `maxRows?: number` | Same tokens as `Input` |
| `Label` | `Label.tsx` | Radix Label props, `required?: boolean` | `text-body-sm font-medium text-fg-primary`. Required shows " *" with `aria-hidden` and adds "(required)" in visually-hidden text |
| `FieldError` | `FieldError.tsx` | `id: string`, `message?: string` | `role="alert"`, `text-body-sm text-danger-fg`, `AlertCircle` icon. The input references it with `aria-describedby` |
| `FormField` | `FormField.tsx` | `label`, `name`, `error?`, `hint?`, `children(fieldProps)` | Wires `id`, `aria-describedby` and `aria-invalid` |
| `Select` | `Select.tsx` | `value`, `onValueChange`, `options: { value: string; label: string }[]`, `placeholder`, `invalid?`, `aria-label?` | Radix Select styled like `Input` |
| `Badge` | `Badge.tsx` | `tone: 'neutral' \| 'brand' \| 'success' \| 'warning' \| 'danger' \| 'accent'`, `icon?: LucideIcon`, `children` | Design-system "Semantic Status Badge": `bg-{tone}-bg border border-{tone}-border text-{tone}-fg text-body-sm font-medium rounded-sm px-2 py-0.5` |
| `Card` | `Card.tsx` | `as?: 'div' \| 'section' \| 'article'`, `padding?: 'md' \| 'lg'` | `bg-surface border border-border rounded-lg`. `md` = p-4, `lg` = p-6. No shadow (flat depth) |
| `Dialog` | `Dialog.tsx` | `open`, `onOpenChange`, `title`, `description?`, `children`, `footer?` | Radix Dialog. Overlay `bg-overlay`. Content `rounded-xl bg-surface p-6 max-w-md`. Enter 200 ms ease-out, exit 150 ms ease-in. Focus trapped. Esc closes. Focus returns to the trigger |
| `ConfirmDialog` | `ConfirmDialog.tsx` | `open`, `onOpenChange`, `title`, `body`, `confirmLabel`, `tone: 'danger' \| 'primary'`, `onConfirm: () => Promise<void>`, `confirmText?: string` (typed confirmation, e.g. `DELETE`) | Replaces browser `confirm()`. The confirm button shows `loading` while `onConfirm` is pending. If `confirmText` is set, the button stays disabled until the input matches exactly |
| `Tooltip` | `Tooltip.tsx` | `content: ReactNode`, `children` (trigger), `side?`, `open?`, `dismissible?: boolean` (default `true`) | Radix Tooltip. Opens on hover **and** keyboard focus. 150 ms ease-out. `bg-fg-primary text-fg-inverse text-body-sm rounded-md px-2 py-1 max-w-xs`. With `dismissible={false}` (used by the low-confidence warning) the content is also rendered as visually-hidden text next to the trigger, so it's always available to screen readers |
| `Popover` | `Popover.tsx` | Radix Popover props | Used for onboarding tips (`14`) |
| `Tabs` | `Tabs.tsx` | Radix Tabs (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) | Active trigger has `border-b-2 border-brand text-fg-primary`. Inactive is `text-fg-secondary`. Arrow-key navigation |
| `Collapsible` | `Collapsible.tsx` | Radix Collapsible | Used by "Why?" (`06`) |
| `DropdownMenu` | `DropdownMenu.tsx` | Radix DropdownMenu parts | Row menus, user menu |
| `Toast` / `Toaster` / `useToast` | `Toast.tsx` | `toast({ title, description?, tone: 'success' \| 'danger' \| 'neutral', action?: { label, onClick } })` | Radix Toast. Bottom-right (bottom-centre under 768 px). Auto-dismiss after 5 s (danger after 8 s). `aria-live="polite"` (danger uses `assertive`) |
| `Skeleton` | `Skeleton.tsx` | `className` | `bg-surface-subtle rounded-md animate-pulse`, `aria-hidden`. Parent sets `aria-busy` |
| `Spinner` | `Spinner.tsx` | `size: 'sm' \| 'md'`, `label?: string` | `Loader2` icon spinning. `role="status"` with visually-hidden label (default "Loading") |
| `Banner` | `Banner.tsx` | `tone: 'info' \| 'warning' \| 'danger' \| 'success'`, `title?`, `children`, `action?: ReactNode`, `onDismiss?: () => void` | Full-width. `bg-{tone}-bg border border-{tone}-border text-{tone}-fg rounded-md p-3`, with an icon per tone. `role="status"` (danger uses `role="alert"`). With no `onDismiss` there is no close button (the legal disclaimer uses this) |
| `Progress` | `Progress.tsx` | `value: number` (0–100), `label: string` | Radix Progress. Track `bg-surface-subtle`, fill `bg-brand`. `aria-valuenow` |
| `VisuallyHidden` | `VisuallyHidden.tsx` | `children` | Radix VisuallyHidden |
| `PageContainer` | `PageContainer.tsx` | `children`, `width?: 'default' \| 'full'` | The page wrapper from §9.6: `flex flex-col gap-10` with responsive page padding |
| `SectionHeader` | `SectionHeader.tsx` | `title`, `description?`, `actions?` | H5 title (`text-h5`), body-sm description in `text-fg-secondary`. `gap-6` before content |

### 8.2 Layout components

| Component | Notes |
|---|---|
| `src/components/layout/AppShell.tsx` | Used by `(app)/layout.tsx`: `TopNav` + `MaintenanceBanner` + `<main id="main">` |
| `src/components/layout/TopNav.tsx` | Logo (link to `/dashboard`), "Review a Contract" link button (hidden under 768 px; the dashboard CTA covers it), `UserMenu` |
| `src/components/layout/UserMenu.tsx` | DropdownMenu: user email (read-only text), "Settings" → `/settings`, "Sign out" (`01-auth.md`) |
| `src/components/layout/MaintenanceBanner.tsx` | §5 |

---

## 9. Design

Source: `docs/design.md`. Components use **semantic tokens only** through Tailwind classes. Primitive palette variables exist only inside `tokens.css`.

### 9.1 `src/styles/tokens.css`

Defines **every primitive** exactly as in `docs/design.md` "CSS Custom Properties Setup": `--color-grey-{900…25}`, `--color-blue-{900…50}`, `--color-green-*`, `--color-red-*`, `--color-yellow-*`, `--color-violet-*`, `--color-orange-*`, plus spacing `--space-1…--space-28`. It then defines these **semantic tokens**:

```css
:root {
  /* text */
  --fg-primary:      var(--color-grey-900);   /* #070A0E */
  --fg-secondary:    var(--color-grey-500);   /* #4A4C4F */
  --fg-disabled:     var(--color-grey-400);   /* #5E6062 */
  --fg-placeholder:  var(--color-grey-400);   /* #5E6062 — grey-300 fails 4.5:1 */
  --fg-link:         var(--color-blue-500);   /* #115ACB */
  --fg-inverse:      #FFFFFF;
  /* surfaces */
  --surface:         #FFFFFF;                 /* cards, modals (bg-white-primary) */
  --surface-page:    var(--color-grey-25);    /* #FAFAFA page background */
  --surface-subtle:  var(--color-grey-50);    /* #F0F0F1 hover, dividers, skeletons */
  --surface-pressed: var(--color-grey-100);   /* #DADADB */
  --overlay:         rgb(7 10 14 / 0.48);     /* grey-900 at 48% */
  /* borders */
  --border:          var(--color-grey-100);   /* decorative: cards, dividers */
  --border-strong:   var(--color-grey-200);   /* hover */
  --border-control:  var(--color-grey-300);   /* inputs, checkboxes: ≥ 3:1 (WCAG 1.4.11) */
  --focus-ring:      var(--color-blue-500);
  /* brand */
  --brand:           var(--color-blue-500);
  --brand-hover:     var(--color-blue-600);
  --brand-pressed:   var(--color-blue-700);
  --brand-subtle:    var(--color-blue-50);
  /* status (design.md "Semantic Status Badge" + state table) */
  --success-bg: var(--color-green-50);  --success-border: var(--color-green-200); --success-fg: var(--color-green-700); --success-solid: var(--color-green-600);
  --warning-bg: var(--color-yellow-50); --warning-border: var(--color-yellow-200); --warning-fg: var(--color-yellow-900); --warning-solid: var(--color-yellow-800);
  --danger-bg:  var(--color-red-50);    --danger-border:  var(--color-red-200);   --danger-fg:  var(--color-red-700);   --danger-solid:  var(--color-red-600);
  --info-bg:    var(--color-blue-50);   --info-border:    var(--color-blue-200);  --info-fg:    var(--color-blue-700);  --info-solid:    var(--color-blue-500);
  --accent-bg:  var(--color-violet-50); --accent-border:  var(--color-violet-200); --accent-fg: var(--color-violet-700); --accent-solid: var(--color-violet-500);
  /* highlights in the document viewer (07) */
  --highlight:        rgb(255 170 51 / 0.35);   /* yellow-500 at 35% */
  --highlight-active: rgb(17 90 203 / 0.25);    /* blue-500 at 25% */
}
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

**Documented contrast adjustments** (WCAG 2.1 AA wins over the design.md state table; see `14-onboarding-a11y.md` §3):

- Warning text uses **Yellow 900** (`#854D00`, ≈ 6.5:1 on Yellow 50) instead of Yellow 800 (≈ 4.1:1, which fails for 12 px text).
- Form-control borders use **Grey 300** (≈ 3.2:1) instead of Grey 100 (≈ 1.4:1), to meet the 3:1 non-text contrast rule.
- Placeholder text uses **Grey 400**.
- Green 500 and Yellow 500 are never used for text or meaningful icons on white.

### 9.2 `tailwind.config.ts`

```ts
const v = (name: string) => `var(--${name})`;
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
    colors: {
      transparent: 'transparent', current: 'currentColor',
      fg: { primary: v('fg-primary'), secondary: v('fg-secondary'), disabled: v('fg-disabled'), placeholder: v('fg-placeholder'), link: v('fg-link'), inverse: v('fg-inverse') },
      surface: { DEFAULT: v('surface'), page: v('surface-page'), subtle: v('surface-subtle'), pressed: v('surface-pressed') },
      overlay: v('overlay'),
      border: { DEFAULT: v('border'), strong: v('border-strong'), control: v('border-control') },
      focus: v('focus-ring'),
      brand: { DEFAULT: v('brand'), hover: v('brand-hover'), pressed: v('brand-pressed'), subtle: v('brand-subtle') },
      success: { bg: v('success-bg'), border: v('success-border'), fg: v('success-fg'), solid: v('success-solid') },
      warning: { bg: v('warning-bg'), border: v('warning-border'), fg: v('warning-fg'), solid: v('warning-solid') },
      danger:  { bg: v('danger-bg'),  border: v('danger-border'),  fg: v('danger-fg'),  solid: v('danger-solid') },
      info:    { bg: v('info-bg'),    border: v('info-border'),    fg: v('info-fg'),    solid: v('info-solid') },
      accent:  { bg: v('accent-bg'),  border: v('accent-border'),  fg: v('accent-fg'),  solid: v('accent-solid') },
      highlight: { DEFAULT: v('highlight'), active: v('highlight-active') },
    },
    spacing: { 0: '0px', px: '1px', 0.5: '2px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px',
               10: '40px', 12: '48px', 16: '64px', 20: '80px', 24: '96px', 28: '112px', 32: '128px', 40: '160px', 64: '256px', 80: '320px', 96: '384px' },
    borderRadius: { none: '0px', sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
    fontFamily: { sans: ['var(--font-inter-display)', 'system-ui', 'sans-serif'] },
    fontSize: {
      h1: ['48px', { lineHeight: '56px', fontWeight: '700' }],
      h2: ['36px', { lineHeight: '44px', fontWeight: '700' }],
      h3: ['30px', { lineHeight: '38px', fontWeight: '600' }],
      h4: ['28px', { lineHeight: '36px', fontWeight: '600' }],
      h5: ['24px', { lineHeight: '32px', fontWeight: '500' }],
      'body-lg': ['16px', { lineHeight: '24px', fontWeight: '500' }],
      'body-sm': ['12px', { lineHeight: '18px', fontWeight: '400' }],
    },
    letterSpacing: { normal: '0' },
    boxShadow: { none: 'none' },                           // flat depth: no shadows
    transitionDuration: { 100: '100ms', 150: '150ms', 200: '200ms', 250: '250ms', 300: '300ms' },
    transitionTimingFunction: { out: 'ease-out', in: 'ease-in', 'in-out': 'ease-in-out' },
    extend: { maxWidth: { prose: '72ch' } },
  },
  plugins: [],
} satisfies Config;
```

Because `colors`, `spacing`, `borderRadius` and `fontSize` **replace** Tailwind's defaults (they aren't under `extend`), off-system values don't exist as utilities. Long-form prose (contract text viewer, chat answers) uses `text-body-lg font-normal` (16/24, weight 400) for readability. This is the only allowed weight override.

### 9.3 Font — Inter Display

- Self-hosted woff2 files (Inter 4.x release, OFL license) in `src/app/fonts/`: `InterDisplay-Regular.woff2` (400), `InterDisplay-Medium.woff2` (500), `InterDisplay-SemiBold.woff2` (600), `InterDisplay-Bold.woff2` (700).
- Loaded in `src/app/fonts.ts`:

```ts
import localFont from 'next/font/local';
export const interDisplay = localFont({
  src: [
    { path: './fonts/InterDisplay-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InterDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/InterDisplay-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/InterDisplay-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter-display', display: 'swap', fallback: ['system-ui', 'sans-serif'],
});
```

### 9.4 Confidence band mapping (used by `06`, `07`, `16`)

| Band | Score | Badge tone | Classes | Icon (lucide) | Extra |
|---|---|---|---|---|---|
| `high` | ≥ 80 | `success` | `bg-success-bg border-success-border text-success-fg` | `CheckCircle2` | — |
| `medium` | 50–79 | `warning` | `bg-warning-bg border-warning-border text-warning-fg` | `AlertCircle` | — |
| `low` | < 50 | `danger` | `bg-danger-bg border-danger-border text-danger-fg` | `AlertTriangle` (⚠️) | Non-dismissible `LOW_CONFIDENCE_TOOLTIP` |

The badge text is always `{score}%`. The accessible name is "Confidence {score} percent, {High|Medium|Low}". Colour is never the only signal.

### 9.5 Motion

| Interaction | Class |
|---|---|
| Hover, focus ring, input focus | `transition-colors duration-100 ease-out` |
| Tooltip, dropdown, popover appear | `duration-150 ease-out` |
| Modal enter / exit | `duration-200 ease-out` / `duration-150 ease-in` |
| Page and panel transitions | `duration-250 ease-in-out` |
| Skeleton → content | `duration-300 ease-in-out` (opacity) |

All motion is disabled under `prefers-reduced-motion` (§9.1).

### 9.6 Page layout

- Page background: `bg-surface-page`. Cards and panels: `bg-surface`.
- `PageContainer` padding: `px-4 py-6` (< 768 px), `md:px-8 md:py-12`, `xl:px-28 xl:py-24` (the design.md 112/96 page padding applies at ≥ 1280 px). Section gap `gap-10` (40 px). Sub-section gap `gap-6` (24 px). Item gap `gap-2` (8 px). Label-block gap `gap-0.5` (2 px).
- Section titles: `text-h5` only. Body and data labels: `text-body-lg`. Captions and metadata: `text-body-sm text-fg-secondary`.

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| A required env var is missing or invalid at boot | The `env.ts` / `env.public.ts` parse throws. `next build` fails (public vars) or the first server request fails with a clear log line naming the field. The app never runs half-configured |
| An env var is set to an empty string (copied from `.env.example`) | Treated as unset, so the default applies (or it fails if required) |
| `@/lib/supabase/admin` is imported in a client component | `server-only` breaks the build. `check-admin-imports` fails CI |
| A route handler throws a non-`AppError` (e.g. a Supabase network error) | `500 INTERNAL_ERROR` with the generic message. The stack is logged with `request_id`. Nothing internal reaches the client |
| Malformed UUID in a path param | `parseParams` → `404 NOT_FOUND` (not 400, so nothing about ids or existence leaks) |
| Request body isn't JSON | `400 VALIDATION_ERROR` with `details._form = "Body must be valid JSON"` |
| Session cookie expired mid-session | Middleware refreshes it. If the refresh token is also invalid, `getUser()` returns null → page routes redirect to `/login?next=…` and API routes return 401, which `apiFetch` turns into the same redirect |
| `next` contains an external URL | Rejected by `isSafeNext` (`01-auth.md`), so the redirect goes to `/dashboard` |
| Supabase is down | `/api/health` → 503, `MaintenanceBanner` shown. Pages that fetch data render their `error.tsx` boundary |
| Health check hangs | 3 s abort → 503 |
| Client is offline | `apiFetch` throws `NETWORK_ERROR` (status 0, retryable). TanStack retries queries twice. Mutations show a toast |
| A `pdf.worker.min.mjs` version mismatch after an upgrade | `postinstall` re-copies the worker from the resolved `pdfjs-dist`, so the worker always matches `react-pdf` |
| Logging a field from the forbidden list | Caught in code review. A unit test asserts the logger output for `withApiHandler` contains no request body |

---

## 11. Acceptance criteria

- [ ] `npm run build`, `npm run lint` and `npm run typecheck` pass on a clean checkout with a complete `.env.local`.
- [ ] `supabase start` applies `20261012000000_initial_schema.sql` with no errors. `npm run db:verify-rls` returns 0 rows for both checks.
- [ ] `src/types/database.types.ts` is generated and committed. CI fails on drift.
- [ ] A missing `OPENAI_API_KEY` makes the first server request fail with "Invalid environment: OPENAI_API_KEY". A missing `NEXT_PUBLIC_SUPABASE_URL` fails `next build`.
- [ ] Unauthenticated `GET /dashboard` → 307 to `/login?next=%2Fdashboard`. An authenticated `GET /login` → 307 to `/dashboard`. An authenticated `GET /` → 307 to `/dashboard`.
- [ ] Any `/api/*` route without a session returns `401` with the README §4 envelope and an `x-request-id` header.
- [ ] `GET /api/health` → `200 {status:"ok",db:"ok",version}` with the stack up, and `503` within 4 s with Postgres stopped.
- [ ] Every response carries the CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` headers.
- [ ] `tailwind.config.ts` exposes no primitive colour utilities. `check-no-hex` passes and fails on an injected `#ff0000` in a component.
- [ ] `check-admin-imports` fails when `@/lib/supabase/admin` is imported from a non-allowlisted file.
- [ ] Inter Display renders at weights 400/500/600/700 with no layout shift (`display: swap` plus the next/font size-adjust fallback).
- [ ] All `src/components/ui/*` primitives pass axe with no serious or critical violations in a Playwright story page (`/__ui` route, enabled only when `NODE_ENV !== 'production'`).
- [ ] `netlify dev` serves the app on :8888, and `/.netlify/functions/process-contract-background` returns 202 locally.

---

## 12. Tests

### 12.1 Test infrastructure

**`vitest.config.ts`** uses two projects:

```ts
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'tests/setup/server-only-stub.ts') } },
  test: {
    workspace: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.{ts,tsx}'], environment: 'node',
          environmentMatchGlobs: [['tests/unit/components/**', 'jsdom'], ['tests/unit/hooks/**', 'jsdom']],
          setupFiles: ['tests/setup/env.ts', 'tests/setup/jest-dom.ts', 'tests/setup/msw.ts'],
          coverage: { provider: 'v8', include: ['src/lib/**', 'src/server/**'], thresholds: { lines: 85 } } } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node',
          setupFiles: ['tests/setup/env.ts', 'tests/setup/msw.ts'], globalSetup: ['tests/setup/integration-global.ts'],
          pool: 'forks', poolOptions: { forks: { singleFork: true } }, testTimeout: 30_000 } },
    ],
  },
});
```

- `tests/setup/env.ts`: sets a complete fake env. For integration, it reads the local stack values from `supabase status -o env` (CI exports them as env vars).
- `tests/setup/msw.ts`: an MSW node server with default OpenAI handlers from `tests/mocks/openai-handlers.ts`, `onUnhandledRequest: 'bypass'` for Supabase, and `'error'` for any `api.openai.com` request without a handler.
- `tests/setup/integration-global.ts`: checks the local Supabase is reachable, runs `seed-users.ts`, and truncates app tables between files with the service-role client (`delete from contracts`, …).
- `tests/helpers/supabase.ts`: `signedInClient(user)` returns a supabase-js client signed in as a seed user (anon key + `signInWithPassword`), for RLS tests. `callRoute(handler, { method, path, params, body, user })` invokes a route handler with a `NextRequest` carrying that user's auth cookies.
- `tests/mocks/openai-mock-server.ts`: a tiny HTTP server on `:4010` that implements `POST /v1/chat/completions` (JSON and streaming) from fixture files. E2E runs set `OPENAI_BASE_URL=http://localhost:4010/v1`; the openai SDK reads this variable natively.

**`playwright.config.ts`**:

- `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8888'`
- `webServer: { command: 'npm run build && npm run start', port: 3000 }` in CI (with `PLAYWRIGHT_BASE_URL=http://localhost:3000` and `PROCESSING_MODE=sync`, because there's no Netlify background runtime under `next start`)
- Projects: `chromium` (desktop), `firefox` (nightly only), `mobile-chrome` (Pixel 7)
- `globalSetup: 'tests/setup/e2e-global.ts'` (seed users + storage state per user)

### 12.2 Unit tests (`tests/unit/`)

| File | Cases |
|---|---|
| `lib/env.test.ts` | Defaults applied (`PROCESSING_MODE=background`, `PROCESSING_SYNC_FALLBACK=true`, `SYNC_PROCESSING_BUDGET_MS=24000`, `CHAT_MAX_INPUT_TOKENS=100000`, models `gpt-4o`). Empty strings → defaults. `PROCESSING_MODE=foo` throws. Salt < 32 chars throws. `SITE_URL` prefers `URL` over `NEXT_PUBLIC_APP_URL`. A trailing slash is stripped |
| `lib/api/errors.test.ts` | `appError` builds the right class and status for every catalog code. `{page_count}` and `{retry_after}` are interpolated. `toErrorResponse` envelope shape. `Retry-After` header on 429. Unknown error → 500 `INTERNAL_ERROR` with a generic message and no stack |
| `lib/api/with-api-handler.test.ts` | Adds `x-request-id` (`req_` + 12 chars) and `Cache-Control: no-store`. An SSE response keeps its own cache header. A thrown `AppError` maps correctly. The completion log line has status and latency and no body |
| `lib/api/parse.test.ts` | Invalid JSON → `_form`. Zod field errors → `details`. Bad UUID param → 404 |
| `lib/api/internal-auth.test.ts` | Correct secret passes. Wrong, missing or different-length secret → 401. Uses `timingSafeEqual` (spy) |
| `lib/api/sse.test.ts` | Event framing `event:`/`data:`. Keep-alive comment after 15 s (fake timers). The stream closes when `run` resolves. `cancel()` aborts the signal |
| `lib/retry.test.ts` | Succeeds on attempt 2 after a 503. No retry on 400. Stops at `attempts`. Backoff 1 s/2 s (fake timers, jitter off). Honours `retry-after` (capped by `maxDelayMs`). Deadline: no attempt starts when the remaining time is ≤ 0; no retry when the remaining time is < `minRemainingMsForRetry`; the per-attempt timeout comes from the remaining time |
| `lib/utils.test.ts` | `slugify` (diacritics, symbols, 50-char cap, empty). `safeFileName` (`"Acme NDA (final).PDF"` → `"acme_nda_final.pdf"`, empty → `contract.pdf`, 80-char cap). `cn` merge |
| `types/domain.test.ts` | `confidenceBand` at 0, 49, 50, 79, 80, 100 |
| `lib/api-client.test.ts` | 2xx JSON. 204 → `undefined`. Error envelope → `ApiClientError` fields. Network failure → status 0, `NETWORK_ERROR`. `Retry-After` parsed |
| `components/ui/*.test.tsx` | `Button` loading → `aria-busy` and disabled. `IconButton` requires `label`. `FieldError` `role=alert`. `ConfirmDialog` with `confirmText` stays disabled until it matches. `Tooltip` opens on focus. `Banner` without `onDismiss` has no close button. `Badge` tones render the correct classes |

### 12.3 Integration tests (`tests/integration/`)

| File | Cases |
|---|---|
| `schema/rls-catalog.test.ts` | Runs both `verify-rls.sql` queries through `pg` (direct DB URL) → 0 rows. All 9 tables exist with RLS enabled |
| `schema/server-only-tables.test.ts` | As Alice (signed-in client): `select`/`insert`/`update`/`delete` on `rate_limits` and `ai_usage_logs` → permission denied or 0 rows, including her own rows (inserted by the service role). `rpc('check_rate_limit')` and `rpc('save_extraction_results')` → permission denied |
| `schema/profile-trigger.test.ts` | Creating a user via the admin API creates a `profiles` row (`plan = 'trial'`, `trial_ends_at` ≈ now + 14 d). Alice can update `full_name`/`feedback_opt_in`/`onboarding_completed_at`. Updating `plan` or `email` → permission denied |
| `api/health.test.ts` | Stack up → 200 `{status:'ok'}`. With the anon client pointed at a closed port (env override) → 503 within 4 s |
| `api/unauthenticated.test.ts` | Every `src/app/api/**/route.ts` export except health, called without cookies → 401 envelope (the route list is discovered by glob, so new routes are covered automatically) |
| `middleware.test.ts` | `middleware()` with a `NextRequest`: protected path without a user → redirect to `/login?next=…`; `/login` with a user → `/dashboard`; `/api/x` → passthrough; refreshed cookies are copied onto redirects |

### 12.4 E2E tests (`tests/e2e/`)

| Spec | Cases |
|---|---|
| `foundation.spec.ts` | Security headers present on `/`. `/dashboard` redirects to `/login?next=%2Fdashboard` when signed out. Unknown URL renders `not-found` with the "Back to dashboard" link. `/api/health` returns `ok` |
| `a11y.spec.ts` | Owned by `14-onboarding-a11y.md`. Includes the `/__ui` primitives page (dev builds) |

### 12.5 CI — `.github/workflows/ci.yml`

Triggers: `pull_request`, and `push` to `main`. Nightly `schedule` (`0 2 * * *`) for Firefox E2E and the full live eval.

| Job | Steps |
|---|---|
| `lint-type-unit` | checkout → `actions/setup-node@v4` (node 20, npm cache) → `npm ci` → `npm run lint` (ESLint + `check-no-hex` + `check-admin-imports`) → `npm run typecheck` → `npm run test:unit` (coverage threshold 85% lines on `src/lib`, `src/server`) |
| `db-integration` | checkout → node → `npm ci` → `supabase/setup-cli@v1` → `supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,supavisor` → export `supabase status -o env` → **RLS catalog check:** `psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/verify-rls.sql` through `scripts/verify-rls.sh` (fails on any row) → `npm run db:types && git diff --exit-code src/types/database.types.ts` → `npm run test:integration` |
| `e2e` (needs both jobs above) | Supabase start (as above) → `npx playwright install --with-deps chromium` → start `tests/mocks/openai-mock-server.ts` in the background → `npm run test:e2e -- --project=chromium` with `PROCESSING_MODE=sync`, `OPENAI_BASE_URL=http://localhost:4010/v1` → upload `playwright-report/` on failure |
| `eval-smoke` (PRs that change `src/lib/ai/**`; secrets `OPENAI_API_KEY_EVAL`) | `npm run eval:chat -- --smoke` against the live API (spec `15-evals.md`) |
| `nightly` (schedule) | `e2e` with `--project=firefox` and `--project=mobile-chrome`. Full evals (`15-evals.md`) |

Branch protection on `main` requires `lint-type-unit`, `db-integration` and `e2e`.
