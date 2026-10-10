import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { callRoute } from '../../helpers/supabase';

// 00-foundation.md §12.3 — every API route except /api/health answers 401 without a session.
// Routes are discovered from the filesystem, so a new route is covered automatically.
const API_DIR = path.join(__dirname, '../../../src/app/api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const PUBLIC_ROUTES = new Set(['health']);

const routeFiles = (readdirSync(API_DIR, { recursive: true }) as string[])
  .filter((f) => f.endsWith(`route.ts`))
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => !PUBLIC_ROUTES.has(path.dirname(f)))
  .sort();

// Top-level await: route modules go through Vitest's resolver (the @/ alias), unlike require().
const modules = await Promise.all(routeFiles.map(async (file) => ({ file, mod: (await import(path.join(API_DIR, file))) as Record<string, unknown> })));
const cases: { route: string; method: (typeof METHODS)[number]; handler: Parameters<typeof callRoute>[0] }[] = [];
for (const { file, mod } of modules) {
  for (const m of METHODS) {
    if (typeof mod[m] === 'function') cases.push({ route: path.dirname(file), method: m, handler: mod[m] as Parameters<typeof callRoute>[0] });
  }
}

describe('unauthenticated API calls', () => {
  it('discovers every route (sanity: the sweep is not empty)', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(10);
    expect(cases.length).toBeGreaterThanOrEqual(14);
  });

  it.each(cases)('$method /api/$route → 401 UNAUTHORIZED', async ({ route, method, handler }) => {
    const id = randomUUID();
    const res = await callRoute(handler, {
      method,
      path: `/api/${route.replace('[id]', id)}`,
      params: route.includes('[id]') ? { id } : {},
      body: method === 'GET' ? undefined : {},
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });

  // Auth is checked before id validation everywhere, so a malformed id can't tell a stranger anything (no 400/404).
  it.each(cases.filter((c) => c.route.includes('[id]')))('$method /api/$route with a malformed id → 401', async ({ route, method, handler }) => {
    const res = await callRoute(handler, {
      method,
      path: `/api/${route.replace('[id]', 'not-a-uuid')}`,
      params: { id: 'not-a-uuid' },
      body: method === 'GET' ? undefined : {},
    });
    expect(res.status).toBe(401);
  });
});
