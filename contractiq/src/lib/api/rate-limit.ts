import 'server-only';
import { logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { RateLimitError } from './errors';

// Per-user fixed-window limits (12-rate-limiting-usage.md §6.2, engineering-doc §8.7).
export type RateLimitBucket = 'upload' | 'process' | 'chat' | 'chat_daily' | 'edit' | 'feedback';

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  upload: { limit: 20, windowSeconds: 3_600 },
  process: { limit: 10, windowSeconds: 3_600 },
  chat: { limit: 30, windowSeconds: 600 },
  chat_daily: { limit: 300, windowSeconds: 86_400 },
  edit: { limit: 120, windowSeconds: 60 },
  feedback: { limit: 30, windowSeconds: 3_600 },
};

/**
 * Throws RateLimitError when over the limit. FAILS OPEN if the limiter itself errors (12 §6.3):
 * it's a cost/abuse control, not an access control, and RATE_LIMIT_CHECK_FAILED alerts the team.
 */
export async function enforceRateLimit(userId: string, bucket: RateLimitBucket): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const { data, error } = await createAdminSupabase()
    .rpc('check_rate_limit', { p_user_id: userId, p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds })
    .single();

  if (error || !data) {
    logger.error('RATE_LIMIT_CHECK_FAILED', { user_id: userId, bucket, error: error?.message });
    return;
  }
  if (!data.allowed) {
    const retryAfter = Math.max(1, Math.ceil((new Date(data.reset_at).getTime() - Date.now()) / 1000));
    throw new RateLimitError(retryAfter, { bucket, reset_at: data.reset_at });
  }
}
