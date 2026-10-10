# 01 — Authentication

**PRD / engineering-doc refs:** US-001, FR-01, PRD Flow 1 and Flow 2. Engineering-doc §4.1, §4.2, §5.2, §6.2 (Authentication), §7.3 (`profiles`), §9.1. Feature **F3**.
**Depends on:** `00-foundation.md` (Supabase clients, middleware, `requireUser`, UI primitives), `supabase-schema.sql` (`profiles`, `handle_new_user`).

---

## 1. Overview

Email and password authentication on Supabase Auth, with **email verification required**:

- `/signup` → verification email → `/auth/callback` → `/dashboard`
- `/login` → `/dashboard` (or a safe `?next=` path)
- `/verify-email` → "check your inbox", with a resend button
- Sign out from the `UserMenu`
- Route protection is done by `middleware.ts` (`00-foundation.md` §6.4). API protection is done by `requireUser()`.

There are no custom API routes for sign-up, sign-in or sign-out. The browser calls Supabase Auth directly through `createBrowserSupabase()`. The only server route is `GET /auth/callback`.

**Out of scope:** OAuth or social login, MFA, password reset UI. *(Password reset isn't listed in the PRD's MVP stories. Supabase's built-in recovery email can be enabled later without schema changes.)*

---

## 2. User flow

### 2.1 Sign up (PRD Flow 1)

1. Visitor clicks "Get Started Free" on `/` → `/signup`.
2. Fills in Email and Password and clicks **Create account**.
3. The client validates (§6.2). On success it calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard` } })`.
4. Supabase creates `auth.users`, the trigger `on_auth_user_created` → `handle_new_user()` inserts `profiles (id, email)` with `plan='trial'` and `trial_ends_at = now() + 14 days`, and Supabase sends the confirmation email.
5. The client stores the email in `sessionStorage['ciq:pending-email']` (wrapped in try/catch) and goes to `/verify-email`.
6. The user clicks the email link → `/auth/callback?token_hash=…&type=email&next=/dashboard`. The route verifies it, sets the session cookies and redirects to `/dashboard`.
7. The dashboard shows the empty state (`10-dashboard.md`) and the onboarding tips (`14-onboarding-a11y.md`).

### 2.2 Sign in (PRD Flow 2)

1. `/login` (optionally with `?next=/contracts/<id>` or `?error=verification_failed`).
2. Email and Password → **Sign in** → `supabase.auth.signInWithPassword({ email, password })`.
3. Success → `router.replace(safeNext(next))` + `router.refresh()`.
4. `email_not_confirmed` → inline banner with a **Resend verification email** button.
5. Invalid credentials → a generic error that doesn't reveal whether the account exists.

### 2.3 Sign out

1. UserMenu → **Sign out** → `supabase.auth.signOut()` (revokes the refresh token, clears the cookies).
2. `queryClient.clear()` → `router.replace('/')` → `router.refresh()`.

---

## 3. Database

| Table | Access | Client | Query |
|---|---|---|---|
| `auth.users` | Write | Supabase Auth (GoTrue) | `signUp`. Confirmation sets `email_confirmed_at` |
| `public.profiles` | Insert | Trigger `handle_new_user()` (SECURITY DEFINER) | `insert into public.profiles (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing` |
| `public.profiles` | Read | `createServerSupabase()` in `(app)/layout.tsx` | `select email, full_name, onboarding_completed_at from profiles where id = auth.uid()` (`.single()`). RLS `profiles_select_own` |

Users cannot insert or delete `profiles` (no policies). They can update only `full_name`, `feedback_opt_in` and `onboarding_completed_at` (column grant). `plan` and `trial_ends_at` are not user-writable.

---

## 4. Database tasks

### 4.1 Schema

Already in `supabase-schema.sql`: table `profiles` (§4.1), `handle_new_user()` and `on_auth_user_created` (§5.2), policies `profiles_select_own` and `profiles_update_own`, and the column grant (§6.1). Nothing extra.

### 4.2 Supabase Auth configuration

**Hosted project** (Dashboard → Authentication):

| Setting | Value |
|---|---|
| Providers → Email | **Enabled** |
| Confirm email | **ON** |
| Secure email change | ON |
| Minimum password length | **8** |
| Password requirements | **Letters and digits** |
| Leaked password protection | ON (if the plan supports it) |
| URL Configuration → Site URL | `https://<production-domain>` (= `NEXT_PUBLIC_APP_URL`) |
| URL Configuration → Redirect URLs | `https://<production-domain>/auth/callback`, `https://deploy-preview-*--<netlify-site>.netlify.app/auth/callback`, `https://*--<netlify-site>.netlify.app/auth/callback`, `http://localhost:8888/auth/callback` |
| Sessions → JWT expiry | 3600 s (default) |
| Refresh token rotation | ON, reuse interval 10 s (default) |
| Rate limits | Defaults: emails sent per hour, sign-ups and sign-ins per 5 min per IP |
| SMTP | **Custom SMTP is required before beta.** The built-in sender only sends a few emails per hour. The provider's credentials go into Dashboard → Authentication → SMTP Settings, not the app env. Sender: `ContractIQ <no-reply@<production-domain>>` |

**Email template → Confirm signup:**

- Subject: `Confirm your ContractIQ account`
- Body (HTML). The link uses `token_hash`, so it works when the email is opened on a different device from the one used to sign up:

```html
<h2>Confirm your email</h2>
<p>Thanks for signing up for ContractIQ. Click below to confirm your email and start reviewing contracts.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm my email</a></p>
<p>If you didn't create an account, you can ignore this email.</p>
```

**Local** (`supabase/config.toml`):

```toml
[auth]
site_url = "http://localhost:8888"
additional_redirect_urls = ["http://localhost:8888/auth/callback", "http://localhost:3000/auth/callback"]
minimum_password_length = 8
password_requirements = "letters_digits"

[auth.email]
enable_signup = true
enable_confirmations = true

[auth.email.template.confirmation]
subject = "Confirm your ContractIQ account"
content_path = "./supabase/templates/confirmation.html"
```

`supabase/templates/confirmation.html` holds the same HTML as above.

---

## 5. API routes

### `GET /auth/callback`

| Field | Value |
|---|---|
| File | `src/app/auth/callback/route.ts` |
| Purpose | Turn an email-verification link into a session cookie |
| Auth | Public |
| Query | Either `token_hash: string` + `type: 'email' \| 'signup'` (email-template link, the primary path), **or** `code: string` (PKCE redirect when Supabase redirects to `emailRedirectTo`). Plus `next?: string` |
| Validation | `next` passes `isSafeNext` (§6.1), otherwise `/dashboard`. `type` must be in `['email', 'signup']` |
| Logic | 1. `const supabase = createServerSupabase()`. 2. If `token_hash` and `type`: `await supabase.auth.verifyOtp({ type: 'email', token_hash })`. Otherwise, if `code`: `await supabase.auth.exchangeCodeForSession(code)`. Otherwise it's a failure. 3. If there's no error → `NextResponse.redirect(new URL(safeNext(next), request.url))`. 4. On error → log `auth_callback_failed` with `{ reason: error.code }` (no email) → redirect to `/login?error=verification_failed` |
| Response | `302` (redirect only, no body) |
| Errors | Expired or used link, PKCE verifier missing (different browser), or missing params → `302 /login?error=verification_failed` |

The route isn't wrapped in `withApiHandler`, because it returns redirects, not JSON. It still sets `Cache-Control: no-store`.

No other routes. `requireUser()` (`00-foundation.md` §6.6) protects every `/api/*` route.

---

## 6. Backend implementation

### 6.1 `src/lib/auth/safe-next.ts`

```ts
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || typeof next !== 'string' || next.length > 512) return false;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return false;
  if (/[\u0000-\u001f\\]/.test(next)) return false;
  try { const u = new URL(next, 'http://x.invalid'); return u.origin === 'http://x.invalid'; } catch { return false; }
}
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  return isSafeNext(next) ? next : fallback;
}
```

`/login`, `/signup` and `/auth/callback` are never valid `next` targets. If `next` starts with any of them, `safeNext` returns the fallback.

### 6.2 Validation — `src/lib/validation/auth.ts`

```ts
export const EmailSchema = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email address').max(254);
export const PasswordSchema = z.string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use 72 characters or fewer')                    // bcrypt limit
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');
export const SignupSchema = z.object({ email: EmailSchema, password: PasswordSchema });
export const LoginSchema  = z.object({ email: EmailSchema, password: z.string().min(1, 'Enter your password') });
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput  = z.infer<typeof LoginSchema>;
```

Login doesn't apply the strength rules, so older accounts can still sign in if the rules change later.

### 6.3 Auth actions — `src/lib/auth/client-auth.ts` (`'use client'`)

```ts
export const AUTH_TIMEOUT_MS = 10_000;
export type AuthResult = { ok: true } | { ok: false; kind: AuthErrorKind; message: string };
export type AuthErrorKind = 'invalid_credentials' | 'email_not_confirmed' | 'email_exists' | 'weak_password'
  | 'rate_limited' | 'timeout' | 'network' | 'unknown';

export async function signUpWithEmail(input: SignupInput): Promise<AuthResult>;
export async function signInWithEmail(input: LoginInput): Promise<AuthResult>;
export async function resendVerification(email: string): Promise<AuthResult>;
export async function signOut(): Promise<void>;
```

Logic:

- Each call is wrapped in `withAuthTimeout(promise)`, which races against `AUTH_TIMEOUT_MS`. On timeout it resolves `{ ok: false, kind: 'timeout', message: 'This is taking longer than expected — please try again.' }`. The underlying request isn't cancelled. If it later succeeds, the next submit (or a page refresh) finds the session.
- `signUpWithEmail`: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=%2Fdashboard` } })`.
  - With confirmations ON, an existing **confirmed** email returns `data.user` with `identities.length === 0` and no error. Map this to `email_exists`.
- `signInWithEmail`: `supabase.auth.signInWithPassword(input)`.
- `resendVerification`: `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: … } })`.
- `signOut`: `supabase.auth.signOut()` (scope `local`).

**Error mapping** (`mapAuthError(error: AuthError)`):

| Supabase `error.code` / status | `kind` | Message shown |
|---|---|---|
| `invalid_credentials` (400) | `invalid_credentials` | "Incorrect email or password" |
| `email_not_confirmed` | `email_not_confirmed` | "Please verify your email — check your inbox for the link." |
| `user_already_exists` / `email_exists` / the identities-empty case | `email_exists` | "An account with this email already exists — sign in instead" (link to `/login`) |
| `weak_password` | `weak_password` | The first reason from `error.reasons`, or "Choose a stronger password (letters and numbers, 8+ characters)." |
| `over_request_rate_limit` / `over_email_send_rate_limit` (429) | `rate_limited` | "Too many attempts — please wait a minute and try again." |
| `AuthRetryableFetchError` / status 0 | `network` | "We couldn't reach the server. Check your connection and try again." |
| anything else | `unknown` | "Something went wrong. Please try again." |

### 6.4 `(app)/layout.tsx` user and profile loading

```ts
const supabase = createServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
if (!user || !user.email_confirmed_at) redirect('/login'); // defence in depth (middleware already redirects)
const { data: profile } = await supabase.from('profiles')
  .select('email, full_name, onboarding_completed_at').eq('id', user.id).single();
// passes { email: user.email, onboardingCompleted: !!profile?.onboarding_completed_at } to AppShell / OnboardingProvider
```

If the profile row is missing (only possible if the trigger failed), the layout renders normally with `onboardingCompleted = true` (no tips) and logs `profile_missing` with `user_id`.

---

## 7. State management

| State | Where |
|---|---|
| Form values and errors | `react-hook-form` with `zodResolver(SignupSchema \| LoginSchema)`. Mode `onSubmit`, re-validating `onChange` after the first submit |
| Submit in progress | `formState.isSubmitting` |
| Server error (`AuthResult`) | Local `useState<AuthResult \| null>` shown in a `Banner` |
| Pending email for `/verify-email` | `sessionStorage['ciq:pending-email']` (try/catch, so the page works without it) |
| Resend cooldown | Local state, 60 s countdown |
| Session | Supabase cookies. On sign-out, `queryClient.clear()` wipes all cached user data |

---

## 8. Components

### 8.1 Pages

| Route | File | Rendering | Content |
|---|---|---|---|
| `/login` | `src/app/(auth)/login/page.tsx` | Server page reads `searchParams.next` and `searchParams.error` and renders `<LoginForm next={…} initialError={…} />` | Title "Sign in to ContractIQ". Link "New to ContractIQ? Create an account" → `/signup` (keeps `next`) |
| `/signup` | `src/app/(auth)/signup/page.tsx` | Server page → `<SignupForm />` | Title "Create your account". Subtitle "Review NDAs and MSAs in minutes — free for 14 days." Link "Already have an account? Sign in" |
| `/verify-email` | `src/app/(auth)/verify-email/page.tsx` | Client component `VerifyEmailNotice` | §8.4 |
| layout | `src/app/(auth)/layout.tsx` | Server | Centred column on `bg-surface-page`: logo (link to `/`), `Card padding="lg"` max-width 400 px, footer link "Back to home". `<main id="main">` |

Each page sets `metadata.title` ("Sign in", "Create account", "Verify your email").

### 8.2 `LoginForm` — `src/components/auth/LoginForm.tsx` (`'use client'`)

| Prop | Type |
|---|---|
| `next` | `string \| undefined` |
| `initialError` | `'verification_failed' \| undefined` |

- Fields: `FormField` Email (`type="email"`, `autoComplete="email"`, autofocused) and Password (`type="password"`, `autoComplete="current-password"`, with a show/hide `IconButton` labelled "Show password" / "Hide password").
- Submit: `Button` "Sign in", full-width, `loading={isSubmitting}`.
- `initialError === 'verification_failed'` shows a warning `Banner`: "That verification link is invalid or has expired. Sign in to get a new one."
- Results:
  - `ok` → `router.replace(safeNext(next)); router.refresh();`
  - `email_not_confirmed` → warning `Banner` with the message and a `Button variant="secondary"` "Resend verification email" (calls `resendVerification(email)`, then shows "Verification email sent." and starts the 60 s cooldown).
  - Other errors → danger `Banner` with the message. Focus moves to the banner (`tabIndex={-1}`, `ref.focus()`).
- States: idle, submitting, error, and timeout (danger banner with the timeout message; the form stays usable).

### 8.3 `SignupForm` — `src/components/auth/SignupForm.tsx` (`'use client'`)

- Fields: Email (`autoComplete="email"`) and Password (`autoComplete="new-password"`, show/hide). The hint under the password is "At least 8 characters, with a letter and a number", linked with `aria-describedby`.
- Live checklist under the password (updates `onChange`, each line `text-body-sm` with a `Check` / `Circle` icon and `aria-live="polite"` on the container): "8+ characters", "A letter", "A number".
- Submit: "Create account", full-width.
- Legal line under the button (`text-body-sm text-fg-secondary`): "By creating an account you agree to our Terms of Service and Privacy Policy." Links go to `/terms` and `/privacy`, static pages whose content the legal review provides before v1.0.
- Results:
  - `ok` → store the email in sessionStorage → `router.push('/verify-email')`.
  - `email_exists` → danger `Banner`: "An account with this email already exists — " plus a link "sign in instead" → `/login`.
  - Others → danger `Banner`.

### 8.4 `VerifyEmailNotice` — `src/components/auth/VerifyEmailNotice.tsx` (`'use client'`)

- `Mail` icon, H5 "Check your inbox".
- Body: "We sent a verification link to **{email}**. Click it to activate your account." If there's no stored email: "We sent a verification link to your email address."
- Secondary body: "Didn't get it? Check your spam folder, or resend the email."
- `Button variant="secondary"` "Resend email". It's disabled during the 60 s cooldown ("Resend in 42s"). If no email is stored, an Email `Input` appears first.
- Link "Back to sign in" → `/login`.

### 8.5 Sign-out in `UserMenu`

The `UserMenu` item "Sign out" (`LogOut` icon) calls `signOut()` → `queryClient.clear()` → `router.replace('/')` → `router.refresh()`. If sign-out fails (network), it still clears the local state and navigates. Supabase's local `signOut` clears the cookies even when the revoke call fails.

---

## 9. Design

- Auth pages: `bg-surface-page`. A `Card` (`bg-surface border border-border rounded-lg p-6`, max-width 400 px) is centred with `py-16` (`py-24` from `md`).
- Title `text-h5 text-fg-primary`. Subtitle `text-body-sm text-fg-secondary`. Form field gap `gap-4`. Gap between sections `gap-6`.
- Inputs use the `Input` primitive (`border-border-control`, focus ring `ring-focus`). Errors use `FieldError` (`text-danger-fg`).
- Primary button `bg-brand`. Text links `text-fg-link underline-offset-2 hover:underline`.
- Banners: `warning` for "not confirmed" and "link expired", `danger` for failures, `success` for "Verification email sent."
- Password checklist: met = `text-success-fg` + `Check`. Unmet = `text-fg-secondary` + `Circle`.

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Sign up with an email that already exists and is confirmed | "An account with this email already exists — sign in instead". No email is sent (Supabase's obfuscated response, detected through `identities.length === 0`) |
| Sign up again with an existing **unconfirmed** email | Supabase re-sends the confirmation. The user goes to `/verify-email` |
| Verification link opened on another device or browser | Works, because the `token_hash` flow needs no PKCE verifier |
| Verification link used twice, or expired (24 h) | `/login?error=verification_failed` banner. Signing in shows `email_not_confirmed` with a resend option (if still unconfirmed), or succeeds (if already confirmed) |
| `next=https://evil.com` or `next=//evil.com` | `safeNext` → `/dashboard` |
| `next=/contracts/<someone else's id>` | Allowed redirect. That page returns `not-found` (RLS) |
| Signed-in user visits `/login` or `/signup` | Middleware → `/dashboard` |
| Sign-in takes > 10 s | Timeout banner. The button returns to idle. A retry is allowed |
| Supabase Auth rate limit | "Too many attempts — please wait a minute and try again." |
| Password manager autofill | `autoComplete` attributes are set, and the fields have `name="email"` / `name="password"` |
| Email entered with capitals or spaces | Trimmed and lower-cased by Zod before the call |
| `sessionStorage` blocked (private mode) | `/verify-email` falls back to the generic copy and an email input for resend |
| A user with no `email_confirmed_at` somehow has a session | `updateSession` and `requireUser` treat them as unauthenticated → `/login` / 401 |
| Profile trigger failed | The layout falls back (§6.4). An integration test guards the trigger |
| Signing out in one tab | Other tabs: the next navigation or API call gets 401 → redirected to `/login` (`apiFetch` 401 handler) |

---

## 11. Acceptance criteria

- [ ] Sign-up with a valid email and password creates `auth.users` and `profiles` rows (`plan='trial'`, `trial_ends_at` ≈ +14 days) and shows `/verify-email` within 10 s.
- [ ] The confirmation email link signs the user in and lands on `/dashboard`, including when opened in a different browser.
- [ ] Sign-in with correct credentials redirects to `/dashboard` within 10 s (US-001). With `?next=/contracts/<id>` it redirects there.
- [ ] Wrong password and unknown email show the **same** message: "Incorrect email or password".
- [ ] An unverified account cannot reach `(app)` routes. Signing in shows the "Please verify your email" banner with a working resend.
- [ ] Password rules are enforced on the client (8–72 chars, a letter, a number) and by Supabase (min 8, letters + digits).
- [ ] An external or protocol-relative `next` never redirects off-site.
- [ ] Signing out clears the session and the query cache, and lands on `/`. `GET /dashboard` then redirects to `/login`.
- [ ] Every auth page passes axe with no serious or critical violations. Every field has a label. Errors are announced (`role="alert"`) and focus moves to the error banner.
- [ ] No email address appears in server logs.

---

## 12. Tests

### Unit (`tests/unit/`)

| File | Cases |
|---|---|
| `lib/auth/safe-next.test.ts` | Accepts `/dashboard`, `/contracts/abc?x=1`. Rejects `null`, `''`, `https://evil.com`, `//evil.com`, `/\evil.com`, `javascript:alert(1)`, strings with control characters, > 512 chars, `/login`. Fallback is `/dashboard` |
| `lib/validation/auth.test.ts` | Email trim and lower-case. Invalid email message. Password: `short1` (too short), `abcdefgh` (no number), `12345678` (no letter), 73 chars (too long), `Password123` OK |
| `lib/auth/client-auth.test.ts` (Supabase client mocked) | `mapAuthError` for every row of the §6.3 table. Empty `identities` → `email_exists`. Timeout after 10 s (fake timers) → `timeout`. `emailRedirectTo` uses `NEXT_PUBLIC_APP_URL` |
| `components/auth/LoginForm.test.tsx` | Required-field errors. Generic invalid-credentials banner. `email_not_confirmed` shows the resend button, which calls `resendVerification`. Success calls `router.replace(next)`. `initialError` banner |
| `components/auth/SignupForm.test.tsx` | Checklist updates live. `email_exists` banner links to `/login`. Success stores the email and pushes `/verify-email` |
| `components/auth/VerifyEmailNotice.test.tsx` | Shows the stored email. Resend cooldown counts down from 60. Without stored email, shows the input |

### Integration (`tests/integration/`)

| File | Cases |
|---|---|
| `auth/callback.test.ts` | Valid `token_hash` (generated with `admin.auth.admin.generateLink({ type: 'signup', … })`, `hashed_token`) → 302 to `/dashboard` with `sb-` cookies set. Invalid hash → 302 `/login?error=verification_failed`. `next=//evil.com` → 302 `/dashboard`. No params → error redirect |
| `auth/profile.test.ts` | (Shared with `00` `profile-trigger.test.ts`.) Profile row created. User cannot insert a second profile or delete theirs. Cannot update `plan` |
| `auth/require-user.test.ts` | No cookie → 401. Unconfirmed user cookie (admin `createUser` with `email_confirm: false`, then `signInWithPassword` fails, so a session is forged through `admin.generateLink` magic link) → 401. Confirmed → passes |

### E2E (`tests/e2e/auth.spec.ts`, Mailpit at `http://localhost:54324`)

1. **Sign up → verify → dashboard:** sign up with a unique email `e2e+<timestamp>@contractiq.test` → `/verify-email` shows the email → poll the Mailpit API (`GET /api/v1/search?query=to:<email>`, up to 10 s) → open the message, extract the `/auth/callback?token_hash=…` link → `page.goto(link)` → URL is `/dashboard` → empty state "No contracts reviewed yet — upload your first contract to begin" is visible.
2. **Duplicate sign-up:** sign up with `alice@contractiq.test` → "An account with this email already exists" message.
3. **Sign in / sign out:** log in as Alice → `/dashboard`. User menu → Sign out → `/`. Visiting `/dashboard` → `/login?next=%2Fdashboard`.
4. **Wrong password:** shows "Incorrect email or password". No navigation.
5. **Unverified sign-in:** a user created via the admin API with `email_confirm: false` → sign-in shows the verify banner. Resend → a new Mailpit message arrives.
6. **Deep link:** signed out → `/contracts/<alice contract id>` → login → lands on that contract.
7. **Open redirect:** `/login?next=https://example.com` → after sign-in the URL is `/dashboard`.
8. **Timing:** sign-in submit → dashboard visible in < 10 s (asserted with `expect(...).toBeVisible({ timeout: 10_000 })`).
