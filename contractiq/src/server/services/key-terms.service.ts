import '@/lib/server-guard'; // 00 §6.12
import type { SupabaseClient } from '@supabase/supabase-js';
import { appError } from '@/lib/api/errors';
import type { KeyTermUpdateInput } from '@/lib/validation/key-term';
import type { KeyTermUpdateResult } from '@/types/api';
import type { Database } from '@/types/database.types';

const RESULT_COLUMNS = 'id, value, page_number, is_edited, original_value, original_page_number, edited_at' as const;

/**
 * Inline correction (08 §6.2). User-scoped client throughout: RLS limits it to the owner, and the column
 * grant limits it to value/page_number. The preserve_original_term_value trigger keeps the first AI
 * value and sets is_edited/edited_at.
 */
export async function updateKeyTerm(
  supabase: SupabaseClient<Database>,
  termId: string,
  input: KeyTermUpdateInput,
): Promise<KeyTermUpdateResult> {
  const { data: row, error } = await supabase
    .from('key_terms')
    .select('id, value, page_number, is_edited, original_value, original_page_number, edited_at, contracts!inner(status, page_count)')
    .eq('id', termId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw appError('NOT_FOUND');

  if (row.contracts.status !== 'completed') throw appError('INVALID_STATUS');
  const pageCount = row.contracts.page_count ?? 0;
  if (input.page_number != null && input.page_number > pageCount) {
    throw appError('VALIDATION_ERROR', { page_number: `Page must be between 1 and ${pageCount}` });
  }

  const patch: { value: string; page_number?: number | null } = { value: input.value };
  const pageGiven = input.page_number !== undefined;
  if (pageGiven) patch.page_number = input.page_number;

  // No-op: don't mark an untouched term as edited.
  if (patch.value === row.value && (!pageGiven || patch.page_number === row.page_number)) {
    return {
      id: row.id,
      value: row.value,
      page_number: row.page_number,
      is_edited: row.is_edited,
      original_value: row.original_value,
      original_page_number: row.original_page_number,
      edited_at: row.edited_at,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from('key_terms')
    .update(patch)
    .eq('id', termId)
    .select(RESULT_COLUMNS)
    .maybeSingle();
  if (updateError) {
    if (updateError.code === '42501') throw appError('INTERNAL_ERROR'); // column privilege: a code bug, not user error
    throw updateError;
  }
  if (!updated) throw appError('NOT_FOUND'); // deleted concurrently
  return updated;
}
