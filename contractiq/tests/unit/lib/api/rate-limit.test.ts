import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '@/lib/api/errors';
import { fakeSupabase, type FakeResult } from '../../../helpers/fake-supabase';

// 12-rate-limiting-usage.md §12 — enforceRateLimit with the admin client mocked.
let fake: ReturnType<typeof fakeSupabase>;
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => fake.client }));
const { enforceRateLimit, RATE_LIMITS } = await import('@/lib/api/rate-limit');

const NOW = new Date('2026-10-10T12:00:00Z');
const rpc = (r: FakeResult) => (fake = fakeSupabase({ onQuery: () => r }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.useRealTimers());

describe('enforceRateLimit', () => {
  it('allowed → resolves, calling check_rate_limit with the bucket limits', async () => {
    rpc({ data: { allowed: true, remaining: 19, reset_at: NOW.toISOString() } });
    await expect(enforceRateLimit('u', 'upload')).resolves.toBeUndefined();
    expect(fake.queries[0]).toMatchObject({ table: 'check_rate_limit', op: 'rpc', payload: { p_user_id: 'u', p_bucket: 'upload', p_limit: RATE_LIMITS.upload.limit, p_window_seconds: RATE_LIMITS.upload.windowSeconds } });
  });

  it('denied → RateLimitError with retryAfterSeconds = ceil((reset_at − now) / 1000)', async () => {
    rpc({ data: { allowed: false, remaining: 0, reset_at: new Date(NOW.getTime() + 41_200).toISOString() } });
    const e = await enforceRateLimit('u', 'chat').catch((err: unknown) => err);
    expect(e).toBeInstanceOf(RateLimitError);
    expect((e as RateLimitError).status).toBe(429);
    expect((e as RateLimitError).retryAfterSeconds).toBe(42);
  });

  it('retryAfterSeconds is at least 1, even when the window has just reset', async () => {
    rpc({ data: { allowed: false, remaining: 0, reset_at: new Date(NOW.getTime() - 5_000).toISOString() } });
    expect(((await enforceRateLimit('u', 'edit').catch((e: unknown) => e)) as RateLimitError).retryAfterSeconds).toBe(1);
  });

  it('an RPC error fails open and logs RATE_LIMIT_CHECK_FAILED', async () => {
    rpc({ data: null, error: { message: 'db down' } });
    await expect(enforceRateLimit('u', 'process')).resolves.toBeUndefined();
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain('RATE_LIMIT_CHECK_FAILED');
  });
});
