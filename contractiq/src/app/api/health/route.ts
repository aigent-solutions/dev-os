import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env.public';
import type { HealthResponse } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public uptime check (00-foundation.md §5). A cookie-less anon read of `profiles` returns [] under
 * RLS, but succeeding proves PostgREST and Postgres are up. The service role is not used.
 * Never throws: any failure or a 3 s timeout → 503.
 */
export async function GET(): Promise<Response> {
  const version = process.env.COMMIT_REF ?? 'dev';
  let dbOk = false;
  try {
    const client = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.from('profiles').select('id').limit(1).abortSignal(AbortSignal.timeout(3000));
    dbOk = !error;
  } catch {
    dbOk = false;
  }
  const body: HealthResponse = dbOk
    ? { status: 'ok', db: 'ok', version }
    : { status: 'degraded', db: 'error', version };
  return Response.json(body, { status: dbOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
