import '@/lib/server-guard'; // loaded by Netlify functions (00-foundation.md §6.12)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env.public';
import { serverEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

// SERVICE ROLE — bypasses RLS. Only for the uses listed in docs/specs/README.md §3.9.
// Importers are limited by scripts/check-admin-imports.mjs.
let adminClient: SupabaseClient<Database> | undefined;

export function createAdminSupabase(): SupabaseClient<Database> {
  return (adminClient ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));
}
