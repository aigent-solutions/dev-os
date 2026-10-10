import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, type ErrorCode } from '@/lib/api/error-catalog';
import { AppError, appError, interpolate, RateLimitError, toErrorResponse } from '@/lib/api/errors';

// 00-foundation.md §12.2.
describe('appError', () => {
  it.each(Object.keys(ERROR_CATALOG) as ErrorCode[])('%s → catalog status and retryable', (code) => {
    const e = appError(code, { page_count: 21, retry_after: 30 });
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe(code);
    expect(e.status).toBe(ERROR_CATALOG[code].status);
    expect(e.retryable).toBe(ERROR_CATALOG[code].retryable);
  });

  it('interpolates {page_count}', () => {
    expect(appError('TOO_MANY_PAGES', { page_count: 21 }).userMessage).toBe('This contract has 21 pages. ContractIQ currently supports up to 20 pages.');
  });

  it('interpolates {retry_after} on rate limits', () => {
    const e = new RateLimitError(42);
    expect(e.userMessage).toContain('42');
    expect(e.details).toMatchObject({ retry_after: 42 });
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
  });
});

describe('toErrorResponse', () => {
  it('builds the envelope with request id and no-store', async () => {
    const res = toErrorResponse(appError('NOT_FOUND'), 'req_abc');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toBe('req_abc');
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: "We couldn't find that contract.", retryable: false, details: {} },
      request_id: 'req_abc',
    });
  });

  it('a 429 carries Retry-After', () => {
    expect(toErrorResponse(new RateLimitError(17), 'r').headers.get('Retry-After')).toBe('17');
  });

  it('an unknown error → 500 INTERNAL_ERROR with a generic message and no stack', async () => {
    const res = toErrorResponse(new Error('secret db details at line 42'), 'r');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('secret db details');
    expect(text).not.toContain('at ');
  });
});
