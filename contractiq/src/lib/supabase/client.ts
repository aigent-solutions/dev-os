'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env.public';
import type { Database } from '@/types/database.types';

// Browser client: auth calls and Storage upload to the user's own folder (00-foundation.md §3).
let browserClient: SupabaseClient<Database> | undefined;

export function createBrowserSupabase(): SupabaseClient<Database> {
  return (browserClient ??= createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ));
}
