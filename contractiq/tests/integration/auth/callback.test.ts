import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/auth/callback/route';
import { deleteTestUser, PASSWORD } from '../../helpers/factories';
import { adminClient } from '../../helpers/supabase';
import { cookieJar } from '../../setup/next-headers-mock';

// 01-auth.md §12 — email verification link → session cookie + safe redirect.
const created: string[] = [];
afterAll(() => Promise.all(created.map(deleteTestUser)));
beforeEach(() => cookieJar.reset([]));

async function signupTokenHash(): Promise<string> {
  const email = `cb-${randomUUID().slice(0, 8)}@contractiq.test`;
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'signup', email, password: PASSWORD });
  if (error || !data.user) throw error;
  created.push(data.user.id);
  return data.properties.hashed_token;
}

const call = (query: string) => GET(new NextRequest(new URL(`/auth/callback${query}`, 'http://localhost:3000')));
const sessionCookieSet = () => cookieJar.entries().some((c) => c.name.startsWith('sb-') && c.value.length > 0);

describe('GET /auth/callback', () => {
  it('a valid token_hash → 302 /dashboard and a session cookie', async () => {
    const res = await call(`?token_hash=${await signupTokenHash()}&type=email`);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    expect(sessionCookieSet()).toBe(true);
  });

  it('honours a safe next path', async () => {
    const res = await call(`?token_hash=${await signupTokenHash()}&type=email&next=${encodeURIComponent('/contracts/new')}`);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/contracts/new');
  });

  it('next=//evil.com → /dashboard (no open redirect)', async () => {
    const res = await call(`?token_hash=${await signupTokenHash()}&type=email&next=${encodeURIComponent('//evil.com')}`);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.host).toBe('localhost:3000');
    expect(loc.pathname).toBe('/dashboard');
  });

  it('an invalid token_hash → 302 /login?error=verification_failed, no session', async () => {
    const res = await call('?token_hash=not-a-real-hash&type=email');
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname + loc.search).toBe('/login?error=verification_failed');
    expect(sessionCookieSet()).toBe(false);
  });

  it('no params → error redirect', async () => {
    const res = await call('');
    expect(new URL(res.headers.get('location')!).search).toBe('?error=verification_failed');
  });

  it('a token can only be used once', async () => {
    const hash = await signupTokenHash();
    await call(`?token_hash=${hash}&type=email`);
    cookieJar.reset([]);
    const again = await call(`?token_hash=${hash}&type=email`);
    expect(new URL(again.headers.get('location')!).search).toBe('?error=verification_failed');
  });
});
