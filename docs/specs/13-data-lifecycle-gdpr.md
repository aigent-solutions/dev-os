# 13 — Data Lifecycle & GDPR

## 1. Overview

**Builds:** everything that removes user data:

1. **Contract deletion:** `DELETE /api/contracts/{id}`, with `DeleteContractDialog` and the `useDeleteContract` hook.
2. **Profile updates:** `PATCH /api/account` (name, data-sharing consent, onboarding flag) and the `useUpdateProfile` hook.
3. **Account deletion (GDPR erasure):** `DELETE /api/account`, with `DeleteAccountDialog`.
4. **Automated retention:** the Netlify Scheduled Function `retention-cleanup`, which runs `runRetention()` daily at 03:00 UTC. It deletes PDFs 90 days after last access, sweeps abandoned `pending_upload` rows and orphaned objects, prunes `rate_limits`, and runs the cost and correction-rate checks.
5. **Settings page:** `/settings` with `ProfileSection`, `DataSharingToggle` and `DeleteAccountDialog`.

**References:**
- Engineering doc: §2.1 (Data lifecycle), §4.5 step 4, §4.6, §4.7, §5.3 (`settings/page.tsx`), §6.2, §7.3, §7.4, §7.13, §9.2 `DELETE /api/contracts/{id}`, §9.7, §10.1 F15.
- PRD §5: 90-day retention, user deletion at any time, GDPR deletion on request.

**Depends on:** `00-foundation.md` (clients, `withApiHandler`, errors), `01-auth.md` (session, sign-out), `supabase-schema.sql` (cascades, storage policies, guard trigger), `12-rate-limiting-usage.md` (`runCostBudgetCheck`, `runCorrectionRateCheck`). Used by `06-results-key-terms-panel.md` (`ResultsHeader` delete), `10-dashboard.md` (row menu delete), `03-upload-extraction.md` (cleans up a failed upload by calling `DELETE /api/contracts/{id}` on a `pending_upload` row) and `14-onboarding-a11y.md` (`onboarding_completed`).

**What is kept and what is deleted**

| Data | Contract delete | Account delete | Retention (90 days after last access) |
|---|---|---|---|
| PDF object in Storage | Deleted (best effort; an orphan is swept within 24 h) | Deleted | Deleted |
| `contracts` row, incl. `contract_text` | Deleted | Deleted | **Kept** (`file_path = NULL`, `file_deleted_at` set) |
| `key_terms`, `custom_key_terms`, `chat_sessions`, `chat_messages`, `user_feedback` | Deleted (cascade from `contracts`) | Deleted (cascade) | Kept |
| `ai_usage_logs` | Kept, with `contract_id` set to NULL (`ON DELETE SET NULL`) | Deleted (cascade from `auth.users`) | Kept |
| `rate_limits` | Kept (expires on its own) | Deleted (cascade) | Rows with `window_start` older than 2 days deleted |
| `profiles`, `auth.users` | Kept | Deleted | Kept |

After retention runs, results still render through the text viewer (`07-document-viewer.md`), because `contract_text` is kept until the user deletes the contract.

---

## 2. User flow

### 2.1 Delete a contract (from the dashboard or the results page)

1. User opens a row's menu on `ContractsTable` (or clicks the "Delete" button in `ResultsHeader`) and chooses **Delete**.
2. `DeleteContractDialog` opens (Radix Dialog, never a browser `confirm()`). It says: "Delete "{file_name}"? This permanently deletes the contract, its key terms, chat history and feedback. This can't be undone." Buttons: **Cancel** and **Delete contract** (destructive).
3. User confirms. The button shows a spinner and `aria-busy="true"`, and both buttons are disabled.
4. `DELETE /api/contracts/{id}` → `204`.
5. Toast: "Contract deleted". Dashboard: the row disappears and the summary refreshes. Results page: `router.replace('/dashboard')`.
6. On error: toast with the catalog message, the dialog stays open, and the buttons are enabled again.

### 2.2 Update profile and data-sharing consent

1. User opens `/settings` (link in `UserMenu`).
2. `ProfileSection`: edit **Full name** → **Save** → `PATCH /api/account { full_name }` → toast "Profile saved".
3. `DataSharingToggle`: switch "Help improve ContractIQ" → `PATCH /api/account { feedback_opt_in }` immediately (optimistic). Toast "Preference saved". The toggle reverts on error.

### 2.3 Delete account

1. User clicks **Delete account** in the "Danger zone" card on `/settings`.
2. `DeleteAccountDialog` explains what will be deleted. A text field asks the user to type `DELETE`. **Delete my account** stays disabled until the field value is exactly `DELETE` (case-sensitive, after trimming).
3. Confirm → `DELETE /api/account { "confirm": "DELETE" }` → `204`.
4. The client calls `createBrowserSupabase().auth.signOut()`, then `queryClient.clear()`, then `useUploadWizardStore.getState().reset()` and `useResultsViewerStore.getState().reset()`, then `router.replace('/?account_deleted=1')`.
5. The landing page sees `account_deleted=1` and shows the toast "Your account and all data have been deleted". It then removes the query param with `router.replace('/')`.
6. On `502 STORAGE_UNAVAILABLE`: the dialog stays open with an inline error message and a **Try again** button. The account still exists.

### 2.4 Automated retention (system)

Netlify runs `retention-cleanup` daily at 03:00 UTC. It runs `runRetention()`, whose steps are in §6.5. The run never touches user-visible state except `file_path`, `file_deleted_at`, abandoned `pending_upload` rows and orphaned objects.

---

## 3. Database

| Operation | Client | Query |
|---|---|---|
| Load contract for delete | user (`createServerSupabase`) | `from('contracts').select('id, user_id, file_path').eq('id', id).maybeSingle()`. RLS returns null for other users' rows, which gives 404 |
| Remove contract object | user Storage client | `storage.from(STORAGE_BUCKET).remove([file_path])`. The storage DELETE policy limits this to the `{auth.uid()}/…` folder |
| Delete contract row | user | `from('contracts').delete().eq('id', id)`. `contracts_delete_own` policy. Cascades to `custom_key_terms`, `key_terms`, `chat_sessions` → `chat_messages`, `user_feedback`. `ai_usage_logs.contract_id` set to NULL |
| Update profile | user | `from('profiles').update(patch).eq('id', user.id).select(PROFILE_COLUMNS).single()`. `patch` only ever has the columns granted to `authenticated` (`full_name`, `feedback_opt_in`, `onboarding_completed_at`) |
| Read profile (settings page) | user | `from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()` |
| List a user's objects (account delete) | **admin** | `storage.from(STORAGE_BUCKET).list(userId, { limit: 1000, offset })` → folder entries (`id === null`) → `list(\`${userId}/${folder}\`, { limit: 1000, offset })` |
| Remove a user's objects | **admin** | `storage.from(STORAGE_BUCKET).remove(paths)` in batches of 100 |
| Delete auth user | **admin** | `auth.admin.deleteUser(userId)`. Cascades through every `user_id` FK to all 9 tables |
| Retention: expired PDFs | **admin** | `from('contracts').select('id, user_id, file_path').not('file_path', 'is', null).lt('last_accessed_at', cutoffIso).order('last_accessed_at').limit(100)`, then `update({ file_path: null, file_deleted_at: nowIso }).in('id', ids)` |
| Retention: pending sweep | **admin** | `from('contracts').select('id, user_id, file_path').eq('status', 'pending_upload').lt('created_at', cutoffIso).limit(100)`, then `delete().in('id', ids).eq('status', 'pending_upload')` |
| Retention: orphaned objects | **admin** | `storage.list('')` (user folders), then `list(userId)` (contract folders), then `from('contracts').select('id').in('id', folderIds)` |
| Retention: rate-limit pruning | **admin** | `from('rate_limits').delete().lt('window_start', twoDaysAgoIso)` |

```ts
// src/server/services/account.service.ts
export const PROFILE_COLUMNS =
  'id, email, full_name, plan, trial_ends_at, feedback_opt_in, onboarding_completed_at, created_at, updated_at';
```

**Why the admin client is required where it is used:**
- `file_path` and `file_deleted_at` are guarded by `trg_contracts_guard_columns` for `authenticated`.
- `rate_limits` is server-only (`rate_limits_deny_all`).
- `auth.admin.*` needs the service role.
- The retention job has no user session.

These uses match README §3.9 items 1, 5, 6 and 7.

---

## 4. Database tasks

Everything required already exists in `supabase-schema.sql`. No new objects.

- [ ] Every child table has `ON DELETE CASCADE` to `contracts(id)` and to `auth.users(id)`. `ai_usage_logs.contract_id` is `ON DELETE SET NULL` (schema §4).
- [ ] `contracts_delete_own` policy (schema §6.2).
- [ ] Storage policies `contracts_objects_select_own` and `contracts_objects_delete_own` (schema §9). There is no UPDATE policy.
- [ ] Column grant `update (full_name, feedback_opt_in, onboarding_completed_at) on profiles to authenticated` (schema §6.1).
- [ ] Indexes `idx_contracts_retention` and `idx_contracts_pending` (schema §4.2). The `rate_limits` PK starts with `user_id`, so the `window_start` prune is a sequential scan. That is acceptable because the table only holds about 2 days of rows.

**Seed:** none.

---

## 5. API routes

### 5.1 `DELETE /api/contracts/{id}`

| Field | Value |
|---|---|
| File | `src/app/api/contracts/[id]/route.ts` (same file as `GET` and `PATCH`, specified in `06`) |
| Purpose | Permanently delete a contract, its PDF and all related rows |
| Auth | Required (`requireUser`) |
| Rate limit | None |
| Params | `id: z.string().uuid()` → otherwise `400 VALIDATION_ERROR` |
| Request body | None |
| Response | `204 No Content` (empty body) |
| Errors | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND` (missing, or owned by someone else) |
| Allowed statuses | Any, including `pending_upload` (upload-failure cleanup) and `processing` (see edge cases) |

Storage removal failure **does not** fail the request. The row is still deleted and the orphaned object is swept by retention step 3 (§6.5).

### 5.2 `PATCH /api/account`

| Field | Value |
|---|---|
| File | `src/app/api/account/route.ts` |
| Auth | Required |
| Rate limit | None |
| Request | `{ "full_name"?: string \| null, "feedback_opt_in"?: boolean, "onboarding_completed"?: true }` |
| Validation (`UpdateProfileSchema`, `src/lib/validation/account.ts`) | `full_name`: trimmed. An empty string becomes `null`, otherwise 1–120 chars. `feedback_opt_in`: boolean. `onboarding_completed`: `z.literal(true)`. `.strict()` rejects unknown keys (e.g. `plan`) with `400`. `.refine(o => Object.keys(o).length > 0, 'At least one field is required')` |
| DB mapping | `full_name → full_name`. `feedback_opt_in → feedback_opt_in`. `onboarding_completed: true → onboarding_completed_at = new Date().toISOString()`, but only if it is currently `null` (the service reads the profile first and leaves an existing timestamp alone) |
| Response `200` | `{ "id", "email", "full_name", "plan", "trial_ends_at", "feedback_opt_in", "onboarding_completed_at", "created_at", "updated_at" }` |
| Errors | `400 VALIDATION_ERROR` (incl. unknown keys), `401 UNAUTHORIZED` |

### 5.3 `DELETE /api/account`

| Field | Value |
|---|---|
| File | `src/app/api/account/route.ts` |
| Purpose | GDPR erasure: all Storage objects under `{user_id}/`, then the auth user (which cascades to all tables) |
| Auth | Required |
| Rate limit | None |
| Request | `{ "confirm": "DELETE" }` — `DeleteAccountSchema = z.object({ confirm: z.literal('DELETE') }).strict()` |
| Response | `204 No Content` |
| Errors | `400 VALIDATION_ERROR` (missing or wrong confirm string), `401 UNAUTHORIZED`, `502 STORAGE_UNAVAILABLE` (a Storage list or remove call failed — the account and all DB rows still exist and the request can be retried), `500 INTERNAL_ERROR` (Storage was emptied but `deleteUser` failed — retryable, and a retry finds no objects and goes straight to `deleteUser`) |
| Ordering guarantee | **No DB row is deleted unless every Storage object has been removed first.** Storage removal is idempotent, so a partial failure only leaves fewer objects for the retry |

---

## 6. Backend implementation

### 6.1 Files

| File | Responsibility |
|---|---|
| `src/app/api/contracts/[id]/route.ts` | `export const DELETE = withApiHandler<{ id: string }>(…)` |
| `src/app/api/account/route.ts` | `export const PATCH`, `export const DELETE` |
| `src/server/services/contracts.service.ts` | `deleteContract(supabase, userId, contractId, log)` |
| `src/server/services/account.service.ts` | `PROFILE_COLUMNS`, `getProfile`, `updateProfile`, `deleteAccount`, `listUserObjectPaths` |
| `src/server/services/retention.service.ts` | `runRetention(now?: Date): Promise<RetentionSummary>` and its step functions |
| `src/lib/storage-paths.ts` | `assertContractPath(path, userId, contractId)`, `isContractPath(path, userId, contractId)`, `chunk<T>(arr, size)` |
| `src/lib/validation/account.ts` | `UpdateProfileSchema`, `DeleteAccountSchema` |
| `netlify/functions/retention-cleanup.mts` | Scheduled entry point |

### 6.2 Path guard — `src/lib/storage-paths.ts`

```ts
export function isContractPath(path: string, userId: string, contractId: string): boolean {
  return path.startsWith(`${userId}/${contractId}/`) && !path.includes('..') && path.split('/').length === 3;
}
export function assertContractPath(path: string, userId: string, contractId: string): void {
  if (!isContractPath(path, userId, contractId)) {
    throw new AppError('FORBIDDEN', 403, 'You don\'t have access to this.', false, { reason: 'path_mismatch' });
  }
}
export function chunk<T>(items: T[], size: number): T[][]; // size 100 everywhere in this spec
```

### 6.3 `deleteContract`

```ts
export async function deleteContract(
  supabase: SupabaseClient<Database>, userId: string, contractId: string, log: Logger,
): Promise<void> {
  const { data: contract, error } = await supabase
    .from('contracts').select('id, user_id, file_path').eq('id', contractId).maybeSingle();
  if (error) throw appError('INTERNAL_ERROR');
  if (!contract) throw appError('NOT_FOUND');

  if (contract.file_path) {
    if (!isContractPath(contract.file_path, userId, contractId)) {
      log.warn('contract_delete_path_mismatch', { contract_id: contractId });   // skip storage, still delete row
    } else {
      const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([contract.file_path]);
      if (rmErr) log.warn('contract_delete_storage_failed', { contract_id: contractId, error: rmErr.message });
    }
  }

  const { error: delErr, count } = await supabase
    .from('contracts').delete({ count: 'exact' }).eq('id', contractId);
  if (delErr) throw appError('INTERNAL_ERROR');
  if (count === 0) throw appError('NOT_FOUND');   // deleted concurrently
  log.info('contract_deleted', { contract_id: contractId });
}
```

Route: `const { user, supabase } = await requireUser(); const { id } = parseParams(ctx.params, IdParamsSchema); await deleteContract(supabase, user.id, id, ctx.log); return new Response(null, { status: 204 });`

### 6.4 Account service

```ts
export async function getProfile(supabase, userId): Promise<Profile>;          // throws INTERNAL_ERROR if missing

export async function updateProfile(supabase, userId, input: UpdateProfileInput): Promise<Profile> {
  const patch: Database['public']['Tables']['profiles']['Update'] = {};
  if (input.full_name !== undefined) patch.full_name = input.full_name;           // null allowed
  if (input.feedback_opt_in !== undefined) patch.feedback_opt_in = input.feedback_opt_in;
  if (input.onboarding_completed) {
    const current = await getProfile(supabase, userId);
    if (!current.onboarding_completed_at) patch.onboarding_completed_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return getProfile(supabase, userId);       // no-op (already onboarded)
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId)
    .select(PROFILE_COLUMNS).single();
  if (error || !data) throw appError('INTERNAL_ERROR');
  return data;
}

/** Every object under `{userId}/` in the contracts bucket. Throws STORAGE_UNAVAILABLE on any list error. */
export async function listUserObjectPaths(admin: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const bucket = admin.storage.from(STORAGE_BUCKET);
  const folders = await listAll(bucket, userId);             // entries with id === null are folders
  const paths: string[] = [];
  for (const entry of folders) {
    if (entry.id !== null) { paths.push(`${userId}/${entry.name}`); continue; } // stray file at depth 2
    const files = await listAll(bucket, `${userId}/${entry.name}`);
    for (const f of files) paths.push(`${userId}/${entry.name}/${f.name}`);
  }
  return paths;
}
// listAll(bucket, prefix): pages with { limit: 1000, offset } until a page returns < 1000 items;
// any { error } → throw appError('STORAGE_UNAVAILABLE').

export async function deleteAccount(userId: string, log: Logger): Promise<void> {
  const admin = createAdminSupabase();
  const paths = await listUserObjectPaths(admin, userId);
  for (const batch of chunk(paths, 100)) {
    if (batch.some(p => !p.startsWith(`${userId}/`))) throw appError('INTERNAL_ERROR');   // defensive
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(batch);
    if (error) { log.error('account_delete_storage_failed', { removed_before_failure: true }); throw appError('STORAGE_UNAVAILABLE'); }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) { log.error('account_delete_auth_failed', { error: error.message }); throw appError('INTERNAL_ERROR'); }
  log.info('account_deleted', { objects_removed: paths.length });
}
```

`DELETE /api/account` route: `requireUser()` → `parseBody(req, DeleteAccountSchema)` → `deleteAccount(user.id, ctx.log)` → `await supabase.auth.signOut()` (clears the session cookies on the response, and errors are ignored because the user no longer exists) → `204`.

### 6.5 Retention — `src/server/services/retention.service.ts`

```ts
export type RetentionSummary = {
  expiredPdfs: { removed: number; skippedPathMismatch: number; failed: number };
  pendingSweep: { rowsDeleted: number; objectsRemoved: number };
  orphanSweep: { foldersScanned: number; objectsRemoved: number; truncated: boolean };
  rateLimitsPruned: number;
  costCheck: 'ok' | 'warning' | 'failed';
  correctionRateCheck: 'ok' | 'warning' | 'failed';
  durationMs: number;
};

const MAX_BATCHES_PER_STEP = 50;      // ≤ 5,000 rows per step per run
const MAX_ORPHAN_USER_FOLDERS = 1000; // bounded scan; truncated=true if more

export async function runRetention(now = new Date()): Promise<RetentionSummary>;
```

Each step is wrapped in its own `try/catch`. If a step fails, it is logged (`retention_step_failed`, `{ step }`) and the next step still runs. The summary is logged as `retention_completed`.

**Step 1 — expired PDFs (90 days after last access)**

```
cutoff = now - PDF_RETENTION_DAYS days
repeat up to MAX_BATCHES_PER_STEP:
  rows = admin contracts WHERE file_path IS NOT NULL AND last_accessed_at < cutoff ORDER BY last_accessed_at LIMIT 100
  if rows empty → break
  valid   = rows.filter(r => isContractPath(r.file_path, r.user_id, r.id))
  invalid = rows - valid → log.warn('retention_path_mismatch', {contract_id}) ; set file_path=NULL, file_deleted_at=now
            for these too (never call Storage with an unexpected path; clearing the pointer stops the loop from re-selecting them)
  { error } = admin.storage.remove(valid.map(r => r.file_path))
  if error → failed += valid.length; log; break        // retry tomorrow, rows untouched
  admin.update({ file_path: null, file_deleted_at: now.toISOString() }).in('id', valid ∪ invalid ids)
```

`remove()` does not error on objects that are already gone, so a run interrupted between `remove` and `update` heals itself on the next run.

**Step 2 — abandoned `pending_upload` rows (older than 24 h)**

```
cutoff = now - PENDING_UPLOAD_TTL_HOURS hours
repeat up to MAX_BATCHES_PER_STEP:
  rows = admin contracts WHERE status='pending_upload' AND created_at < cutoff LIMIT 100
  if empty → break
  paths = rows.filter(r => r.file_path && isContractPath(r.file_path, r.user_id, r.id)).map(r => r.file_path)
  if paths.length: admin.storage.remove(paths)   // error → log, still delete rows (objects become orphans → step 3)
  admin.delete().in('id', ids).eq('status', 'pending_upload')  // status filter: never delete a row that just moved to ready
```

**Step 3 — orphaned objects** (objects whose contract row no longer exists, left behind by a failed Storage removal in contract deletion, step 2, or an upload racing with account deletion)

```
userFolders = admin.storage.list('', paginated)  → folder entries (id === null), max MAX_ORPHAN_USER_FOLDERS (truncated flag)
for each userFolder:
  contractFolders = list(userFolder) folder entries
  existing = admin contracts.select('id').in('id', contractFolders.map(f => f.name))   // chunks of 100
  for each contractFolder not in existing:
    files = list(`${user}/${folder}`)
    keep files whose created_at > now - 24h            // upload in flight: row may be committed later
    remove(files paths) in batches of 100
```

Folder names that aren't UUIDs are logged with `retention_unexpected_folder` and skipped. They are never removed.

**Step 4 — rate-limit pruning:** `admin.from('rate_limits').delete({ count: 'exact' }).lt('window_start', now - 2 days)`.

**Step 5 — checks:** `await runCostBudgetCheck(now)` and `await runCorrectionRateCheck(now)` from `src/server/services/usage.service.ts` (`12-rate-limiting-usage.md`). Each returns `'ok' | 'warning'` and is recorded in the summary. A throw is recorded as `'failed'`.

### 6.6 Scheduled function — `netlify/functions/retention-cleanup.mts`

```ts
import type { Config } from '@netlify/functions';
import { runRetention } from '../../src/server/services/retention.service';
import { logger } from '../../src/lib/logger';

export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string };
  const summary = await runRetention(new Date());
  logger.info('retention_completed', { ...summary, next_run });
  return new Response(null, { status: 200 });
};

export const config: Config = { schedule: '0 3 * * *' };
```

- Scheduled functions have a 30 s execution limit. The batch caps keep each run bounded, and anything left over is processed the next day. If `durationMs > 25_000`, log `retention_near_timeout`.
- **Bundling requirement:** this function, and `process-contract-background.mts`, import service modules outside Next.js. Every module reachable from `netlify/functions/*` must load in plain Node: the `server-only` package throws outside the `react-server` export condition. Modules on this path use `import '@/lib/server-guard'` instead (README §3.11, `00-foundation.md` §6), and confirm with `netlify functions:invoke retention-cleanup` locally.
- Can be triggered manually in development: `netlify functions:invoke retention-cleanup`.

---

## 7. State management

| Item | Implementation |
|---|---|
| `useDeleteContract()` (`src/hooks/useDeleteContract.ts`) | `useMutation({ mutationFn: (id) => apiFetch(\`/api/contracts/${id}\`, { method: 'DELETE' }) })` (throws `ApiClientError` on non-2xx). `onSuccess(_, id)`: `queryClient.removeQueries({ queryKey: qk.contract(id) })`, `removeQueries(qk.contractStatus(id))`, `removeQueries(qk.chat(id))`, `invalidateQueries({ queryKey: ['contracts'] })`, `invalidateQueries({ queryKey: qk.dashboardSummary() })` |
| `useUpdateProfile()` (`src/hooks/useUpdateProfile.ts`) | `useMutation` → `PATCH /api/account`. `onMutate`: cancel `qk.profile()`, snapshot, `setQueryData(qk.profile(), old => ({ ...old, ...optimisticFields }))`. `onError`: restore the snapshot and show a toast. `onSuccess(data)`: `setQueryData(qk.profile(), data)` |
| Profile query | `/settings` server component fetches the profile and passes it to the client components as `initialProfile`. They seed `useQuery({ queryKey: qk.profile(), queryFn: () => initialProfile, initialData: initialProfile, staleTime: Infinity })` (no GET endpoint exists, and mutations keep the cache current) |
| Account deletion | Local component state (`confirmText`, `submitting`, `error`). After `204`: `signOut()` → `queryClient.clear()` → store resets → `router.replace('/?account_deleted=1')` |

---

## 8. Components

### 8.1 Tree

```
(app)/settings/page.tsx          (server: getUser → getProfile → render)
└── SettingsPage
    ├── PageHeader ("Settings")
    ├── ProfileSection           (client)
    ├── DataSharingToggle        (client)
    └── DangerZoneCard
        └── DeleteAccountDialog  (client)
components/contracts/DeleteContractDialog.tsx  (client; used by ContractsTable row menu and ResultsHeader)
```

### 8.2 `DeleteContractDialog`

| Prop | Type | Notes |
|---|---|---|
| `contractId` | `string` | |
| `fileName` | `string` | Shown in the title, truncated to 60 chars with an ellipsis |
| `trigger` | `ReactNode` | Radix `Dialog.Trigger asChild` |
| `onDeleted?` | `() => void` | Results page passes `() => router.replace('/dashboard')` |

- **Behaviour:** uses `useDeleteContract`. Focus starts on **Cancel**. Esc and overlay click close the dialog only when not submitting. On success it closes and shows the toast "Contract deleted".
- **States:** idle; submitting (spinner in the destructive button, both buttons disabled); error (inline `role="alert"` message above the buttons, using the catalog message).

### 8.3 `ProfileSection`

- **Fields:** Email (read-only text, `text-secondary`, with the note "Email changes are not supported yet"), Full name (`Input`, maxLength 120, optional), Plan (read-only: "Free trial — ends {trial_ends_at formatted 'd MMM yyyy'}", or the plan name capitalised).
- **Form:** react-hook-form + `zodResolver(UpdateProfileSchema.pick({ full_name: true }))`. **Save** is disabled until the form is dirty. On submit, `useUpdateProfile.mutate({ full_name })`, toast "Profile saved", and the form resets to the saved values.

### 8.4 `DataSharingToggle`

- Radix `Switch` with `id="feedback-opt-in"` and a `<label htmlFor>`: "Help improve ContractIQ".
- Description (`text-secondary`): "Allow your corrections to extracted terms to be used, anonymised, to improve our prompts. Your contract text and identity are never shared. You can turn this off at any time."
- `checked = profile.feedback_opt_in`. `onCheckedChange(v) → mutate({ feedback_opt_in: v })`. Disabled while the mutation is pending.

### 8.5 `DeleteAccountDialog`

- **Trigger:** destructive outline button "Delete account" inside `DangerZoneCard` (title "Delete account", body: "Permanently delete your account, all contracts, uploaded PDFs, extracted terms, chat history and feedback.").
- **Dialog body:** a list of what will be deleted, then "This can't be undone." Then an `Input` labelled "Type DELETE to confirm", with `autoComplete="off"` and `spellCheck={false}`.
- **Confirm button:** "Delete my account", enabled only when `confirmText.trim() === 'DELETE'`.
- **Submit:** `apiFetch('/api/account', { method: 'DELETE', json: { confirm: 'DELETE' } })`.
- **States:** idle, submitting, error (inline alert with the catalog message, plus **Try again**, which resubmits).

### 8.6 Landing toast

`(marketing)/page.tsx` is SSG, so a small client component `AccountDeletedToast` reads `useSearchParams().get('account_deleted') === '1'`, shows the toast once, then calls `router.replace('/')`. It is wrapped in `<Suspense>`.

---

## 9. Design

All values come from `docs/design.md` tokens through Tailwind (README §5).

| Element | Tokens |
|---|---|
| Settings page canvas | `bg-surface` page, cards `bg-primary` with the design-system card radius and `space-6` padding, `space-6` gap between cards |
| Section titles | H5 / Medium (24/32, 500) `text-primary`. Descriptions are Paragraph Small (12/18, 400) `text-secondary` |
| Danger zone card | Border Red 100 (via the semantic `border-danger` token defined in `00-foundation.md`), title `text-primary` |
| Destructive buttons | Red ★500 background, white text. Focus ring Primary Blue ★500 |
| Inline errors | Red ★500 text on a Red 50 tint, `role="alert"` |
| Toasts | Success: Green ★500 icon on a Green 50 tint |
| Switch | On: Primary Blue ★500. Off: Grey 200. Thumb white |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Delete a contract owned by another user | `404 NOT_FOUND` (RLS hides the row). No Storage call |
| Delete the same contract twice (double click, two tabs) | First `204`, second `404` → the client treats `404` on delete as already deleted: removes cached queries and shows "Contract deleted" |
| `file_path` is NULL (retention already ran, or the upload never finished) | Storage step skipped, row deleted, `204` |
| Storage outage during contract delete | Row deleted, `204`. Warning logged. Orphan removed by retention step 3 at least 24 h after creation |
| `file_path` doesn't match `{user_id}/{id}/…` (should be impossible because of the guard trigger) | Storage skipped, `contract_delete_path_mismatch` warning logged, row deleted |
| Delete while the contract is `processing` | Row deleted. The background or sync `runExtraction` then gets `save_extraction_results` → `P0002` (no `processing` row). `runExtraction` must treat a missing contract as "deleted", log `extraction_contract_deleted` and stop without retrying. Its error-state update matches 0 rows, which is fine |
| Delete while a chat answer is streaming | The assistant-message insert fails its FK. The chat service logs `chat_contract_deleted` and the stream ends with `event: error` (`NOT_FOUND`) |
| Signed PDF URL already issued before deletion | Stays valid until it expires (≤ 3,600 s, `SIGNED_URL_TTL_SECONDS`), but the object is deleted, so later fetches return 404/400 from Storage. Documented limitation: signed URLs can't be revoked |
| `PATCH /api/account` with `{ "plan": "pro" }` | `400 VALIDATION_ERROR` (strict schema). Even without the schema, the column grant blocks it (permission denied) |
| `PATCH /api/account` with `{}` | `400 VALIDATION_ERROR` ("At least one field is required") |
| `onboarding_completed: true` when already set | `200`, `onboarding_completed_at` unchanged |
| `full_name: "   "` | Stored as `null` |
| Account delete with `confirm: "delete"` | `400 VALIDATION_ERROR`. The UI can't send it anyway (button disabled) |
| Storage list or remove fails during account delete | `502 STORAGE_UNAVAILABLE`. The auth user and all rows remain. Retry removes whatever is left (idempotent) |
| `deleteUser` fails after Storage was emptied | `500 INTERNAL_ERROR` (retryable). The account still works with no PDFs, and results fall back to the text viewer. A retry deletes the user |
| User uploads in another tab while their account is being deleted | The new object may survive (listed before upload). Its row disappears with the user cascade, so it becomes an orphan and is removed by retention step 3 |
| A user with more than 1,000 contract folders | `listAll` paginates with `offset`, so nothing is missed |
| Retention: more than 5,000 expired PDFs in one day | Capped by `MAX_BATCHES_PER_STEP`. The rest are processed on following days (oldest first) |
| Retention: Storage outage | Step 1 stops and leaves rows untouched. Steps 2–5 still run. Everything is retried the next day |
| Retention: a `pending_upload` row moves to `ready` between select and delete | The `.eq('status', 'pending_upload')` filter on delete keeps it |
| Retention: an upload is in flight with an object but no committed row | The orphan sweep skips objects created less than 24 h ago |
| Retention runs twice (manual invoke plus schedule) | Idempotent. The second run finds nothing to do |

---

## 11. Acceptance criteria

- [ ] `DELETE /api/contracts/{id}` returns `204`, and afterwards these queries all return 0 for that contract id: `contracts`, `key_terms`, `custom_key_terms`, `chat_sessions`, `chat_messages`, `user_feedback`. `storage.objects` has no object at its `file_path`. `ai_usage_logs` rows for it remain with `contract_id IS NULL`.
- [ ] Deleting another user's contract returns `404` and changes nothing.
- [ ] A Storage failure during contract deletion still returns `204`, logs a warning, and the orphan is removed by the next retention run once it is older than 24 h.
- [ ] `DeleteContractDialog` is an in-app modal, keyboard-operable, and focus returns to the trigger on close. After deletion from the results page the user lands on `/dashboard`.
- [ ] `PATCH /api/account` updates only `full_name`, `feedback_opt_in` and `onboarding_completed_at`. Any other key returns `400`.
- [ ] `DELETE /api/account` with `{ "confirm": "DELETE" }` returns `204`. Afterwards no row in any of the 9 public tables has that `user_id` (or `id` for `profiles`), `auth.users` has no row, and `storage.objects` has no object whose name starts with `{user_id}/`.
- [ ] A Storage failure during account deletion returns `502` and the user can still sign in.
- [ ] After account deletion the browser is signed out, all query caches are cleared, and the landing page shows "Your account and all data have been deleted".
- [ ] Retention: contracts last accessed more than 90 days ago have `file_path IS NULL`, `file_deleted_at` set and their object removed. `contract_text`, `key_terms` and chat are untouched, and the results page renders with the text viewer.
- [ ] Retention: `pending_upload` rows older than 24 h are deleted together with their objects. Newer ones are untouched.
- [ ] Retention: `rate_limits` rows with `window_start` older than 2 days are deleted.
- [ ] Retention calls `runCostBudgetCheck` and `runCorrectionRateCheck` and logs one `retention_completed` summary line.
- [ ] `retention-cleanup` is deployed with schedule `0 3 * * *` and shows up under the site's scheduled functions in Netlify.

---

## 12. Tests

### Unit (`tests/unit/…`)

| File | Cases |
|---|---|
| `lib/storage-paths.test.ts` | Valid path. Other user's id. Other contract id. `..` segments. Extra depth. `chunk` sizes 0/1/100/101/250 |
| `lib/validation/account.test.ts` | Strict rejects `plan`. Empty object rejected. `full_name` blank → null. 121 chars rejected. `onboarding_completed: false` rejected. Confirm literal |
| `server/services/retention.service.test.ts` (admin client mocked) | Step 1 removes and updates in batches, stops on Storage error, path-mismatch rows cleared without a Storage call. Step 2 status-filtered delete. Step 3 skips existing contract folders, objects < 24 h old and non-UUID folders. Step 4 cutoff = now − 2 days. A failing step doesn't stop later steps. Summary shape |
| `server/services/account.service.test.ts` | `listUserObjectPaths` paginates (1,000 + 1 items), throws `STORAGE_UNAVAILABLE` on a list error. `deleteAccount` never calls `deleteUser` when remove fails |
| `components/DeleteAccountDialog.test.tsx` | Button disabled until `DELETE` is typed exactly. Lowercase keeps it disabled. Error renders an alert and Try again |
| `components/DeleteContractDialog.test.tsx` | Focus on Cancel. Submitting disables buttons. A `404` response is treated as deleted |
| `components/DataSharingToggle.test.tsx` | Optimistic toggle, reverts on error |

### Integration (`tests/integration/…`, local Supabase via `supabase start`)

| File | Cases |
|---|---|
| `api/contracts-delete.test.ts` | Owner delete → `204`, plus the **cascade verification queries** below. User B → `404`. `pending_upload` row deletable. Storage stopped (`docker stop` of the storage container) → `204` and the object remains |
| `api/account.test.ts` | PATCH each field. PATCH `plan` → `400`. Direct user-client `update({ plan: 'pro' })` → permission denied (column grant). DELETE wrong confirm → `400`. DELETE → `204` and the cascade verification queries. Storage outage → `502`, user still exists |
| `jobs/retention.test.ts` | Seed: an expired contract with an object (`last_accessed_at = now() - 91 days`), a fresh contract, a 25-h-old `pending_upload` with an object, an orphan object 25 h old, an orphan object 1 h old, a 3-day-old `rate_limits` row. Run `runRetention()` and assert each outcome. Running again changes nothing |

**Cascade verification queries** (run with the service role after the delete; each must return 0 rows unless noted):

```sql
-- Contract delete (:cid = contract id)
select count(*) from public.contracts        where id = :cid;
select count(*) from public.key_terms        where contract_id = :cid;
select count(*) from public.custom_key_terms where contract_id = :cid;
select count(*) from public.chat_sessions    where contract_id = :cid;
select count(*) from public.chat_messages    where contract_id = :cid;
select count(*) from public.user_feedback    where contract_id = :cid;
select count(*) from storage.objects where bucket_id = 'contracts' and name like :uid || '/' || :cid || '/%';
select count(*) from public.ai_usage_logs    where contract_id = :cid;
-- ai_usage_logs rows are KEPT: capture their ids (:usage_ids) before the delete, then expect
-- count = cardinality(:usage_ids) and every row has contract_id null:
select count(*) from public.ai_usage_logs    where id = any(:usage_ids) and contract_id is null;  -- = number of captured ids

-- Account delete (:uid = user id)
select count(*) from auth.users              where id = :uid;
select count(*) from public.profiles         where id = :uid;
select count(*) from public.contracts        where user_id = :uid;
select count(*) from public.custom_key_terms where user_id = :uid;
select count(*) from public.key_terms        where user_id = :uid;
select count(*) from public.chat_sessions    where user_id = :uid;
select count(*) from public.chat_messages    where user_id = :uid;
select count(*) from public.user_feedback    where user_id = :uid;
select count(*) from public.ai_usage_logs    where user_id = :uid;
select count(*) from public.rate_limits      where user_id = :uid;
select count(*) from storage.objects where bucket_id = 'contracts' and name like :uid || '/%';
```

### E2E (`tests/e2e/…`)

| Spec | Flow |
|---|---|
| `dashboard.spec.ts` (shared with `10`) | Delete from the row menu → confirm → row gone, summary decremented |
| `account-deletion.spec.ts` | Sign up → upload a fixture NDA → `/settings` → type `DELETE` → confirm → landing toast → sign-in with the same credentials fails with "Incorrect email or password" |
| `settings.spec.ts` | Edit name → reload shows the new name. Toggle data sharing → reload keeps the state. axe: 0 serious or critical violations on `/settings` and in both dialogs |
