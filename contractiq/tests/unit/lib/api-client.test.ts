import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch, errorTone } from '@/lib/api-client';

// 00-foundation.md §12.2.
afterEach(() => vi.unstubAllGlobals());
const respond = (r: Response | (() => never)) => vi.stubGlobal('fetch', vi.fn(async () => (typeof r === 'function' ? r() : r)));
const caught = async (p: Promise<unknown>) => (await p.catch((e: unknown) => e)) as ApiClientError;

describe('apiFetch', () => {
  it('2xx JSON → the body; json option sets Content-Type and body', async () => {
    respond(Response.json({ a: 1 }));
    expect(await apiFetch('/api/x', { method: 'POST', json: { q: 1 } })).toEqual({ a: 1 });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init).toMatchObject({ method: 'POST', body: '{"q":1}', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
  });

  it('204 → undefined', async () => {
    respond(new Response(null, { status: 204 }));
    expect(await apiFetch('/api/x')).toBeUndefined();
  });

  it('the error envelope becomes an ApiClientError with every field', async () => {
    respond(Response.json({ error: { code: 'INVALID_STATUS', message: 'Not ready', retryable: false, details: { f: 'x' } }, request_id: 'req_1' }, { status: 409 }));
    const e = await caught(apiFetch('/api/x'));
    expect(e).toBeInstanceOf(ApiClientError);
    expect(e).toMatchObject({ status: 409, code: 'INVALID_STATUS', message: 'Not ready', retryable: false, details: { f: 'x' }, requestId: 'req_1' });
  });

  it('a non-JSON 5xx → INTERNAL_ERROR, retryable', async () => {
    respond(new Response('<html>bad gateway</html>', { status: 502 }));
    expect(await caught(apiFetch('/api/x'))).toMatchObject({ status: 502, code: 'INTERNAL_ERROR', retryable: true });
  });

  it('a network failure → status 0, NETWORK_ERROR', async () => {
    respond(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await caught(apiFetch('/api/x'))).toMatchObject({ status: 0, code: 'NETWORK_ERROR', retryable: true });
  });

  it('parses Retry-After', async () => {
    respond(Response.json({ error: { code: 'RATE_LIMITED', message: 'wait' } }, { status: 429, headers: { 'Retry-After': '42' } }));
    expect((await caught(apiFetch('/api/x'))).retryAfterSeconds).toBe(42);
  });

  it('errorTone: 429 → warning, others → danger', () => {
    expect(errorTone(new ApiClientError(429, 'RATE_LIMITED', '', true, {}, null, 1))).toBe('warning');
    expect(errorTone(new ApiClientError(500, 'X', '', true, {}, null, null))).toBe('danger');
  });
});
