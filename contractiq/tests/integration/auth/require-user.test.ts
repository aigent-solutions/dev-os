import { afterAll, describe, expect, it } from 'vitest';
import { requireUser } from '@/lib/api/require-user';
import { AppError } from '@/lib/api/errors';
import { closeDb, sql } from '../../helpers/db';
import { createTestUser, deleteTestUser } from '../../helpers/factories';
import { sessionCookies } from '../../helpers/supabase';
import { cookieJar } from '../../setup/next-headers-mock';

// 01-auth.md §12 — requireUser accepts only a valid session for an email-verified user.
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

const expect401 = async () => {
  const err = await requireUser().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(401);
};

describe('requireUser', () => {
  it('no cookie → 401', async () => {
    cookieJar.reset([]);
    await expect401();
  });

  it('a garbage session cookie → 401', async () => {
    const user = await createTestUser();
    created.push(user.id);
    const cookies = await sessionCookies(user);
    cookieJar.reset(cookies.map((c) => ({ ...c, value: 'base64-' + Buffer.from('{"access_token":"x"}').toString('base64url') })));
    await expect401();
  });

  it('a valid session for a user whose email is not confirmed → 401', async () => {
    const user = await createTestUser();
    created.push(user.id);
    cookieJar.reset(await sessionCookies(user));
    await sql('update auth.users set email_confirmed_at = null where id = $1', [user.id]);
    await expect401();
  });

  it('a confirmed user passes and gets an RLS-scoped client', async () => {
    const user = await createTestUser();
    created.push(user.id);
    cookieJar.reset(await sessionCookies(user));
    const { user: got, supabase } = await requireUser();
    expect(got.id).toBe(user.id);
    const { data } = await supabase.from('profiles').select('id');
    expect(data).toEqual([{ id: user.id }]);
  });
});
