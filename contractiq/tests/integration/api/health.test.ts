import { afterEach, describe, expect, it, vi } from 'vitest';

// 00-foundation.md §12.3 — public uptime check.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('GET /api/health', () => {
  it('200 ok while the local stack is up', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('503 degraded within 4 s when the database is unreachable', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9'); // closed port
    vi.resetModules(); // publicEnv is parsed at import
    const { GET } = await import('@/app/api/health/route');
    const started = Date.now();
    const res = await GET();
    expect(Date.now() - started).toBeLessThan(4000);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'error' });
  });
});
