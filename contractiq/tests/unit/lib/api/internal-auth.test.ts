import * as crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/api/errors';
import { assertInternalRequest, internalAuthHeaders } from '@/lib/api/internal-auth';

// 00-foundation.md §12.2 — the Next.js → background-function shared secret.
vi.mock('node:crypto', async (orig) => {
  const actual = await orig<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const req = (secret?: string) => new Request('http://x/', { headers: secret === undefined ? {} : { 'x-internal-secret': secret } });
const SECRET = process.env.INTERNAL_FUNCTION_SECRET!;

describe('assertInternalRequest', () => {
  it('the correct secret passes, compared in constant time', () => {
    expect(() => assertInternalRequest(req(SECRET))).not.toThrow();
    expect(crypto.timingSafeEqual).toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['wrong, same length', SECRET.replace(/.$/, (c) => (c === 'x' ? 'y' : 'x'))],
    ['different length', SECRET + 'x'],
  ])('%s secret → 401', (_label, secret) => {
    const err = (() => {
      try {
        assertInternalRequest(req(secret));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(401);
  });

  it('internalAuthHeaders carries the secret', () => {
    expect(internalAuthHeaders()).toEqual({ 'x-internal-secret': SECRET });
  });
});
