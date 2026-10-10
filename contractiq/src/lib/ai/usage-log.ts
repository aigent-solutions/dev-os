import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
import { logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { calculateCostUsd } from './pricing';

export type AiUsageEntry = {
  userId: string;
  contractId: string | null;
  operation: 'extraction' | 'extraction_repair' | 'chat';
  model: string;
  promptVersion: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  success: boolean;
  errorCode?: string | null;
};

/** One ai_usage_logs row per logical OpenAI call (12 §6.5). Awaited by callers; never throws. */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const { error } = await createAdminSupabase()
      .from('ai_usage_logs')
      .insert({
        user_id: entry.userId,
        contract_id: entry.contractId,
        operation: entry.operation,
        model: entry.model,
        prompt_version: entry.promptVersion,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        cost_usd: calculateCostUsd(entry.promptTokens, entry.completionTokens),
        latency_ms: Math.round(entry.latencyMs),
        attempts: entry.attempts,
        success: entry.success,
        error_code: entry.errorCode ?? null,
      });
    if (error) throw error;
  } catch (err) {
    logger.error('AI_USAGE_LOG_FAILED', {
      user_id: entry.userId,
      contract_id: entry.contractId,
      operation: entry.operation,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
