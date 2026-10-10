import '@/lib/server-guard'; // README §3.9: every service
import type { SupabaseClient } from '@supabase/supabase-js';
import { appError } from '@/lib/api/errors';
import type { DashboardSummary } from '@/types/api';
import type { Database } from '@/types/database.types';

// Dashboard summary (10 §6.2). User-scoped client: RLS limits every count and row to the caller.
export async function getDashboardSummary(supabase: SupabaseClient<Database>): Promise<DashboardSummary> {
  const [{ data: s, error: e1 }, { data: recent, error: e2 }] = await Promise.all([
    supabase.rpc('get_dashboard_summary').single(),
    supabase
      .from('contracts')
      .select('id, file_name, contract_type, status, review_completed_at, created_at')
      .neq('status', 'pending_upload')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  if (e1 || e2 || !s) throw appError('INTERNAL_ERROR');
  return {
    total: Number(s.total), // bigint counts
    by_type: { nda: Number(s.nda_count), msa: Number(s.msa_count) },
    reviewed: Number(s.reviewed_count),
    recent: recent ?? [],
  };
}
