import '@/lib/server-guard';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appError } from '@/lib/api/errors';
import { STORAGE_BUCKET } from '@/lib/constants';
import type { Logger } from '@/lib/logger';
import { chunk } from '@/lib/storage-paths';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { UpdateProfileInput } from '@/lib/validation/account';
import type { Profile } from '@/types/api';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;
export type Bucket = ReturnType<Client['storage']['from']>;

export const PROFILE_COLUMNS =
  'id, email, full_name, plan, trial_ends_at, feedback_opt_in, onboarding_completed_at, created_at, updated_at';

const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

/** The caller's profile (user client, RLS). Missing → INTERNAL_ERROR (the signup trigger always creates one). */
export async function getProfile(supabase: Client, userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
  if (error || !data) throw appError('INTERNAL_ERROR');
  return data;
}

/**
 * PATCH /api/account (13 §6.4). Only full_name, feedback_opt_in and onboarding_completed_at (the columns
 * granted to authenticated). An existing onboarding timestamp is never moved.
 */
export async function updateProfile(supabase: Client, userId: string, input: UpdateProfileInput): Promise<Profile> {
  const patch: Database['public']['Tables']['profiles']['Update'] = {};
  if (input.full_name !== undefined) patch.full_name = input.full_name; // null allowed
  if (input.feedback_opt_in !== undefined) patch.feedback_opt_in = input.feedback_opt_in;
  if (input.onboarding_completed) {
    const current = await getProfile(supabase, userId);
    if (!current.onboarding_completed_at) patch.onboarding_completed_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return getProfile(supabase, userId); // already onboarded: no-op
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_COLUMNS).single();
  if (error || !data) throw appError('INTERNAL_ERROR');
  return data;
}

/** Every entry under `prefix`, paging by offset until a short page. Any list error → STORAGE_UNAVAILABLE. */
export async function listStorageEntries(bucket: Bucket, prefix: string) {
  const entries: { name: string; id: string | null; created_at: string | null }[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE, offset });
    if (error || !data) throw appError('STORAGE_UNAVAILABLE');
    entries.push(...data);
    if (data.length < LIST_PAGE) return entries;
  }
}

/** Every object under `{userId}/` in the contracts bucket (folders have id === null). */
export async function listUserObjectPaths(admin: Client, userId: string): Promise<string[]> {
  const bucket = admin.storage.from(STORAGE_BUCKET);
  const paths: string[] = [];
  for (const entry of await listStorageEntries(bucket, userId)) {
    if (entry.id !== null) {
      paths.push(`${userId}/${entry.name}`); // stray file at depth 2
      continue;
    }
    for (const f of await listStorageEntries(bucket, `${userId}/${entry.name}`)) paths.push(`${userId}/${entry.name}/${f.name}`);
  }
  return paths;
}

/**
 * GDPR erasure (13 §6.4). Every Storage object goes first; only then the auth user, whose FKs cascade to all
 * 9 tables. A Storage failure leaves the account intact (502); removal is idempotent, so a retry finishes it.
 */
export async function deleteAccount(userId: string, log: Logger): Promise<void> {
  const admin = createAdminSupabase();
  const paths = await listUserObjectPaths(admin, userId);
  for (const batch of chunk(paths, REMOVE_BATCH)) {
    if (batch.some((p) => !p.startsWith(`${userId}/`))) throw appError('INTERNAL_ERROR'); // defensive
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(batch);
    if (error) {
      log.error('account_delete_storage_failed', { removed_before_failure: true });
      throw appError('STORAGE_UNAVAILABLE');
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    log.error('account_delete_auth_failed', { error: error.message });
    throw appError('INTERNAL_ERROR');
  }
  log.info('account_deleted', { objects_removed: paths.length });
}
