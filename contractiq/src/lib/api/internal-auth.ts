import '@/lib/server-guard'; // loaded by the background Netlify function (00-foundation.md §6.12)
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { appError } from './errors';

/** Constant-time check of x-internal-secret (Next.js → background function). */
export function assertInternalRequest(req: Request): void {
  const got = Buffer.from(req.headers.get('x-internal-secret') ?? '');
  const want = Buffer.from(serverEnv.INTERNAL_FUNCTION_SECRET);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw appError('UNAUTHORIZED');
}

export function internalAuthHeaders(): Record<string, string> {
  return { 'x-internal-secret': serverEnv.INTERNAL_FUNCTION_SECRET };
}
