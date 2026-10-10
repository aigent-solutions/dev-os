import { createClient } from '@supabase/supabase-js';
import { assertLocalSupabase } from './local-only';

// Test users for integration and E2E (00-foundation.md §4.4). Local stack only — never production.
export const SEED_USERS = {
  alice: { email: 'alice@contractiq.test', password: 'Password123' },
  bob: { email: 'bob@contractiq.test', password: 'Password123' },
} as const;

export type SeedUserName = keyof typeof SEED_USERS;
export type SeededUser = { id: string; email: string; password: string };

/**
 * Creates the seed users through the admin API (inserting into auth.users directly would bypass
 * GoTrue). Reuses a user that already exists. The handle_new_user trigger creates profiles rows.
 */
export async function seedUsers(): Promise<Record<SeedUserName, SeededUser>> {
  assertLocalSupabase();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const out = {} as Record<SeedUserName, SeededUser>;
  for (const [name, creds] of Object.entries(SEED_USERS) as [SeedUserName, (typeof SEED_USERS)[SeedUserName]][]) {
    const { data, error } = await admin.auth.admin.createUser({ ...creds, email_confirm: true });
    let id = data.user?.id;
    if (error) {
      if (error.status !== 422) throw error;
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (listError) throw listError;
      id = list.users.find((u) => u.email === creds.email)?.id;
    }
    if (!id) throw new Error(`seedUsers: could not create or find ${creds.email}`);
    out[name] = { id, email: creds.email, password: creds.password };
  }
  return out;
}
