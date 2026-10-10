import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';
import { sessionCookies } from '../helpers/supabase';
import { SEED_USERS, type SeededUser } from '../setup/seed-users';
import { adminClient } from '../helpers/supabase';

// 00-foundation.md §12.3 — page protection and cookie handling, against the real local Auth server.
let alice: SeededUser;
beforeAll(async () => {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  alice = { id: data.users.find((u) => u.email === SEED_USERS.alice.email)!.id, ...SEED_USERS.alice };
});

const req = (path: string, cookies: { name: string; value: string }[] = []) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: cookies.length ? { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } : {},
  });

/** The session cookie with expires_at in the past, so the Supabase client must refresh it. */
function expiredSession(cookies: { name: string; value: string }[]) {
  return cookies.map((c) => {
    if (!c.value.startsWith('base64-')) return c;
    const session = JSON.parse(Buffer.from(c.value.slice(7), 'base64url').toString('utf8')) as { expires_at: number };
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    return { name: c.name, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') };
  });
}

describe('middleware', () => {
  it.each(['/dashboard', '/contracts/new', '/settings'])('signed out: %s → /login?next=…', async (path) => {
    const res = await middleware(req(`${path}?tab=1`));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe(`${path}?tab=1`);
  });

  it('signed out: public pages and API routes pass through', async () => {
    for (const path of ['/', '/login', '/signup', '/api/contracts']) {
      const res = await middleware(req(path));
      expect(res.headers.get('location'), path).toBeNull();
    }
  });

  it.each(['/', '/login', '/signup'])('signed in: %s → /dashboard', async (path) => {
    const res = await middleware(req(path, await sessionCookies(alice)));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('signed in: protected pages pass through', async () => {
    const res = await middleware(req('/dashboard', await sessionCookies(alice)));
    expect(res.headers.get('location')).toBeNull();
  });

  it('a refreshed session cookie is copied onto the redirect', async () => {
    const res = await middleware(req('/login', expiredSession(await sessionCookies(alice))));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    const setCookie = res.headers.getSetCookie().filter((c) => c.startsWith('sb-'));
    expect(setCookie.length).toBeGreaterThan(0);
  });
});
