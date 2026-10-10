import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/with-api-handler';

// 00-foundation.md §12.2.
const req = () => new NextRequest('http://localhost:3000/api/thing', { method: 'POST', body: JSON.stringify({ secret: 'BODY-SECRET' }) });
const logs = () => [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('withApiHandler', () => {
  it('adds x-request-id (req_ + 12 chars) and Cache-Control: no-store', async () => {
    const res = await withApiHandler(async () => Response.json({ ok: true }))(req(), { params: {} });
    expect(res.headers.get('x-request-id')).toMatch(/^req_[A-Za-z0-9_-]{12}$/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('an SSE response keeps its own Cache-Control', async () => {
    const res = await withApiHandler(async () => new Response('', { headers: { 'content-type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } }))(req(), { params: {} });
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
  });

  it('a thrown AppError maps to its envelope; the request id matches the header', async () => {
    const res = await withApiHandler(async () => {
      throw appError('INVALID_STATUS');
    })(req(), { params: {} });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { request_id: string; error: { code: string } };
    expect(body.error.code).toBe('INVALID_STATUS');
    expect(body.request_id).toBe(res.headers.get('x-request-id'));
  });

  it('an unexpected error → 500 and an error log line', async () => {
    const res = await withApiHandler(async () => {
      throw new Error('boom');
    })(req(), { params: {} });
    expect(res.status).toBe(500);
    expect(logs().some((l) => l.msg === 'request_failed')).toBe(true);
  });

  it('logs completion with status and latency, never the body', async () => {
    await withApiHandler(async () => Response.json({ ok: true }, { status: 201 }))(req(), { params: {} });
    const done = logs().find((l) => l.msg === 'request_completed')!;
    expect(done).toMatchObject({ status: 201, method: 'POST', path: '/api/thing' });
    expect(typeof done.latency_ms).toBe('number');
    expect(JSON.stringify(logs())).not.toContain('BODY-SECRET');
  });

  it('passes params through', async () => {
    const handler = vi.fn(async () => Response.json({}));
    await withApiHandler<{ id: string }>(handler)(req(), { params: { id: 'abc' } });
    expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ params: { id: 'abc' } }));
  });
});
