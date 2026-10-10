import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { assertLocalSupabase } from '../setup/local-only';
import type { SeededUser } from '../setup/seed-users';

// Supabase helpers with no Vitest dependency, so Playwright (E2E setup and specs) can use them too.
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Service-role client for test setup and assertions only. */
export function adminClient(): SupabaseClient<Database> {
  assertLocalSupabase(url());
  return createClient<Database>(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A supabase-js client signed in as a seed user (anon key + password), for RLS tests. */
export async function signedInClient(user: SeededUser): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url(), anon(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

/**
 * The auth cookies @supabase/ssr would set after this user signs in. Reuses the library's own
 * cookie format (name, chunking, encoding), so route handlers and middleware accept them.
 */
export async function sessionCookies(user: SeededUser): Promise<{ name: string; value: string }[]> {
  const jar = new Map<string, string>();
  const client = createServerClient<Database>(url(), anon(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return [...jar].map(([name, value]) => ({ name, value }));
}
