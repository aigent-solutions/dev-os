import '@/lib/server-guard'; // README §3.9: every service
import type { SupabaseClient } from '@supabase/supabase-js';
import { appError } from '@/lib/api/errors';
import { MAX_FEEDBACK_COMMENT } from '@/lib/constants';
import type { FeedbackInput } from '@/lib/validation/feedback';
import type { FeedbackResult } from '@/types/api';
import type { Database } from '@/types/database.types';

/**
 * Upsert the caller's feedback for a completed contract (11 §6.2). User client throughout, so RLS applies.
 * nps_score is never in the payload, so a Phase 2 value survives; updated_at comes from the trigger.
 */
export async function upsertFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
  contractId: string,
  input: FeedbackInput,
): Promise<FeedbackResult> {
  const { data: contract, error: readError } = await supabase.from('contracts').select('id, status').eq('id', contractId).maybeSingle();
  if (readError) throw appError('INTERNAL_ERROR');
  if (!contract) throw appError('NOT_FOUND');
  if (contract.status !== 'completed') throw appError('INVALID_STATUS');

  const { data, error } = await supabase
    .from('user_feedback')
    .upsert(
      { user_id: userId, contract_id: contractId, rating: input.rating, comment: input.comment, accuracy_rating: input.accuracy_rating },
      { onConflict: 'user_id,contract_id' },
    )
    .select('id, rating, comment, accuracy_rating, updated_at')
    .single();
  if (error) {
    if (error.code === '23514') throw appError('VALIDATION_ERROR', { comment: `Comment must be ${MAX_FEEDBACK_COMMENT} characters or fewer` });
    if (error.code === '42501') throw appError('NOT_FOUND'); // defensive: ownership was proved above
    throw appError('INTERNAL_ERROR');
  }
  return data;
}
