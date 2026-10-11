import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { AppError } from '@/lib/api/errors';
import { assertSameOriginWrite, isJsonContentType } from '@/lib/security/requestGuard';

// Stage 7 #4 — CSRF defence in depth: browser writes must come from this site.
const SITE = 'http://localhost:3000'; // NEXT_PUBLIC_APP_URL in tests/setup/env.ts → SITE_URL
const req = (method: string, headers: Record<string, string> = {}, url = `${SITE}/api/contracts`) => new Request(url, { method, headers });
const blocked = (r: Request) => {
  try {
    assertSameOriginWrite(r);
    return null;
  } catch (e) {
    return e as AppError;
  }
};

describe('assertSameOriginWrite', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s from this origin passes', (m) => {
    expect(blocked(req(m, { origin: SITE, 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s from another origin → 403 FORBIDDEN', (m) => {
    const e = blocked(req(m, { origin: 'https://evil.example' }));
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it.each(['cross-site', 'same-site'])('Sec-Fetch-Site: %s → 403 even without an Origin header', (site) => {
    expect(blocked(req('POST', { 'sec-fetch-site': site }))?.status).toBe(403);
  });

  it('the opaque "null" origin (sandboxed iframe, file://) → 403', () => {
    expect(blocked(req('POST', { origin: 'null' }))?.status).toBe(403);
  });

  it('a lookalike origin (prefix/suffix of ours) → 403', () => {
    expect(blocked(req('POST', { origin: `${SITE}.evil.example` }))?.status).toBe(403);
    expect(blocked(req('POST', { origin: 'http://localhost:30001' }))?.status).toBe(403);
  });

  it('the origin the request arrived on passes even when it differs from SITE_URL (deploy previews)', () => {
    const preview = 'https://deploy-preview-7--contractiq2026.netlify.app';
    expect(blocked(req('POST', { origin: preview, 'sec-fetch-site': 'same-origin' }, `${preview}/api/contracts`))).toBeNull();
  });

  it('the configured SITE_URL passes even when the request URL differs (proxy/rewrite)', () => {
    expect(blocked(req('POST', { origin: SITE }, 'http://internal-host:8080/api/contracts'))).toBeNull();
  });

  it('no Origin and no Sec-Fetch-Site (server-to-server, tests) passes', () => {
    expect(blocked(req('POST'))).toBeNull();
  });

  it('GET/HEAD/OPTIONS are never blocked (reads have no side effects)', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(blocked(req(m, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }))).toBeNull();
  });

  it('logs a warning with the origin when it blocks', () => {
    const log = { warn: vi.fn() } as unknown as Parameters<typeof assertSameOriginWrite>[1];
    expect(() => assertSameOriginWrite(req('POST', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), log)).toThrow();
    expect(log!.warn).toHaveBeenCalledWith('request_blocked_cross_site', { origin: 'https://evil.example', sec_fetch_site: 'cross-site' });
  });
});

describe('isJsonContentType', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=utf-8', true],
    ['Application/JSON', true],
    ['text/plain', false],
    ['application/x-www-form-urlencoded', false],
    ['multipart/form-data; boundary=x', false],
  ])('%s → %s', (type, ok) => expect(isJsonContentType(new Request(SITE, { method: 'POST', headers: { 'content-type': type } }))).toBe(ok));
});

describe('withApiHandler runs the guard first', () => {
  it('a cross-site POST → 403 and the handler never runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withApiHandler(handler);
    const res = await route(new NextRequest(`${SITE}/api/contracts`, { method: 'POST', headers: { origin: 'https://evil.example' } }), { params: {} });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });
});
