import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';
import { appError } from './errors';

/** The signed-in, email-verified user and their RLS-scoped client, or 401 UNAUTHORIZED. */
export async function requireUser(): Promise<{ user: User; supabase: SupabaseClient<Database> }> {
  const supabase = createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) throw appError('UNAUTHORIZED');
  return { user, supabase };
}
