import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../../../helpers/fake-supabase';

// 12-rate-limiting-usage.md §12.
let fake: ReturnType<typeof fakeSupabase>;
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => fake.client }));
const { logAiUsage } = await import('@/lib/ai/usage-log');

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
const entry = {
  userId: 'u', contractId: 'c', operation: 'extraction' as const, model: 'gpt-4o', promptVersion: 'extraction-v1.0',
  promptTokens: 15_000, completionTokens: 1_500, latencyMs: 812.6, attempts: 2, success: true,
};

describe('logAiUsage', () => {
  it('maps fields to the snake_case columns, with the computed cost', async () => {
    fake = fakeSupabase({});
    await logAiUsage(entry);
    expect(fake.queries[0]).toMatchObject({ table: 'ai_usage_logs', op: 'insert' });
    expect(fake.queries[0]!.payload).toEqual({
      user_id: 'u', contract_id: 'c', operation: 'extraction', model: 'gpt-4o', prompt_version: 'extraction-v1.0',
      prompt_tokens: 15_000, completion_tokens: 1_500, cost_usd: 0.0525, latency_ms: 813, attempts: 2, success: true, error_code: null,
    });
  });

  it('an insert error never throws; it logs AI_USAGE_LOG_FAILED', async () => {
    fake = fakeSupabase({ onQuery: () => ({ error: new Error('db down') }) });
    await expect(logAiUsage({ ...entry, success: false, errorCode: 'OPENAI_UNAVAILABLE' })).resolves.toBeUndefined();
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain('AI_USAGE_LOG_FAILED');
  });
});
