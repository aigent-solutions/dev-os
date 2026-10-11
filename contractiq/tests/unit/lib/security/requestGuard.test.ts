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

  // The live incident (Stage 7 deploy): on Netlify req.url doesn't carry the hostname the browser used, so a
  // same-origin edit from the main--<site> branch address was refused when the Origin was compared to req.url.
  const BRANCH = 'https://main--contractiq2026.netlify.app';
  it('the real failing request — Sec-Fetch-Site same-origin, Origin = Host = main--… , req.url elsewhere — passes', () => {
    const r = req('PATCH', { origin: BRANCH, 'sec-fetch-site': 'same-origin', host: 'main--contractiq2026.netlify.app' }, 'https://contractiq2026.netlify.app/api/key-terms/k1');
    expect(blocked(r)).toBeNull();
  });

  it('Sec-Fetch-Site is authoritative when present: same-origin passes whatever the Origin and URL say', () => {
    expect(blocked(req('POST', { origin: 'https://some-other-alias.example', 'sec-fetch-site': 'same-origin' }, 'http://internal:8080/api/contracts'))).toBeNull();
    expect(blocked(req('POST', { 'sec-fetch-site': 'none' }))).toBeNull(); // user-typed navigation
  });

  it('…and cross-site still fails even when the Origin looks like ours', () => {
    expect(blocked(req('POST', { origin: SITE, 'sec-fetch-site': 'cross-site' }))?.status).toBe(403);
  });

  describe('fallback when Sec-Fetch-Site is absent (older browsers): Origin vs this deployment’s hosts', () => {
    it('an Origin matching the Host header passes even when req.url differs (Netlify branch address)', () => {
      expect(blocked(req('PATCH', { origin: BRANCH, host: 'main--contractiq2026.netlify.app' }, 'https://contractiq2026.netlify.app/api/x'))).toBeNull();
    });
    it('an Origin matching X-Forwarded-Host passes (first value of a list)', () => {
      expect(blocked(req('POST', { origin: BRANCH, 'x-forwarded-host': 'main--contractiq2026.netlify.app, proxy.internal' }, 'http://internal:8080/api/x'))).toBeNull();
    });
    it('the configured SITE_URL passes even when the request URL differs', () => {
      expect(blocked(req('POST', { origin: SITE }, 'http://internal-host:8080/api/contracts'))).toBeNull();
    });
    it('a foreign Origin is refused even when Host is ours', () => {
      expect(blocked(req('POST', { origin: 'https://evil.example', host: 'main--contractiq2026.netlify.app' }))?.status).toBe(403);
    });
    it('host comparison ignores case', () => {
      expect(blocked(req('POST', { origin: 'https://MAIN--ContractIQ2026.netlify.app', host: 'main--contractiq2026.netlify.app' }))).toBeNull();
    });
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
    expect(log!.warn).toHaveBeenCalledWith('request_blocked_cross_site', { origin: 'https://evil.example', sec_fetch_site: 'cross-site', host: null });
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
