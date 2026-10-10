import { http, HttpResponse } from 'msw';
import { afterAll, describe, expect, it } from 'vitest';
import { DELETE, PATCH } from '@/app/api/account/route';
import { accountLeftovers, allZero } from '../../helpers/cascade';
import { closeDb, sql } from '../../helpers/db';
import { contractPath, createTestUser, deleteTestUser, seedContract, seedContractChildren, uploadObject } from '../../helpers/factories';
import { adminClient, callRoute, signedInClient } from '../../helpers/supabase';
import { server } from '../../setup/msw';

// 13-data-lifecycle-gdpr.md §12 — PATCH and DELETE /api/account (GDPR erasure).
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});
const fresh = async () => {
  const u = await createTestUser();
  created.push(u.id);
  return u;
};
const patch = (user: Awaited<ReturnType<typeof fresh>>, body: unknown) => callRoute(PATCH, { method: 'PATCH', path: '/api/account', body, user });
const del = (user: Awaited<ReturnType<typeof fresh>>, body: unknown) => callRoute(DELETE, { method: 'DELETE', path: '/api/account', body, user });

/** A user with data in every table and two PDFs in Storage. */
async function userWithEverything() {
  const user = await fresh();
  for (let i = 0; i < 2; i++) {
    const c = await seedContract(user.id);
    await uploadObject(contractPath(user.id, c.id));
    await adminClient().from('contracts').update({ file_path: contractPath(user.id, c.id) }).eq('id', c.id);
    await seedContractChildren(c.id, user.id);
  }
  await adminClient().from('rate_limits').insert({ user_id: user.id, bucket: 'upload', window_start: new Date().toISOString(), count: 1 });
  return user;
}

describe('PATCH /api/account', () => {
  it.each([
    [{ full_name: 'Grace Hopper' }, { full_name: 'Grace Hopper' }],
    [{ full_name: '' }, { full_name: null }],
    [{ feedback_opt_in: true }, { feedback_opt_in: true }],
  ])('%j → 200 and the profile reflects it', async (body, expected) => {
    const res = await patch(await fresh(), body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(expected);
  });

  it.each([[{ plan: 'pro' }], [{ email: 'x@example.com' }], [{}], [{ full_name: 'x'.repeat(121) }]])('%j → 400 VALIDATION_ERROR', async (body) => {
    const res = await patch(await fresh(), body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('a direct user-client update of plan is denied by the column grant', async () => {
    const user = await fresh();
    const { error } = await (await signedInClient(user)).from('profiles').update({ plan: 'pro' } as never).eq('id', user.id);
    expect(error?.code ?? error?.message).toMatch(/42501|permission denied/);
  });
});

describe('DELETE /api/account', () => {
  it('a wrong confirmation → 400 and nothing is deleted', async () => {
    const user = await fresh();
    for (const body of [{ confirm: 'delete' }, { confirm: 'DELETE ' }, {}]) {
      const res = await del(user, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await accountLeftovers(user.id)).auth_users).toBe(1);
  });

  it('DELETE → 204, and every row and object of the user is gone', async () => {
    const user = await userWithEverything();
    const before = await accountLeftovers(user.id);
    expect(before.storage_objects).toBe(2);
    expect(before.contracts).toBe(2);
    const res = await del(user, { confirm: 'DELETE' });
    expect(res.status).toBe(204);
    const after = await accountLeftovers(user.id);
    expect(after).toEqual(allZero(after));
  });

  it("does not touch another user's data", async () => {
    const [victim, bystander] = [await userWithEverything(), await userWithEverything()];
    const before = await accountLeftovers(bystander.id);
    expect((await del(victim, { confirm: 'DELETE' })).status).toBe(204);
    expect(await accountLeftovers(bystander.id)).toEqual(before);
  });

  it('Storage unavailable → 502 and the account still exists (retry can finish it)', async () => {
    const user = await userWithEverything();
    server.use(http.delete(/\/storage\/v1\/object\/contracts$/, () => HttpResponse.json({ error: 'unavailable' }, { status: 503 })));
    const res = await del(user, { confirm: 'DELETE' });
    server.resetHandlers();
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('STORAGE_UNAVAILABLE');
    const left = await accountLeftovers(user.id);
    expect(left.auth_users).toBe(1);
    expect(left.profiles).toBe(1);
    expect(left.contracts).toBe(2);

    // The retry completes the erasure.
    expect((await del(user, { confirm: 'DELETE' })).status).toBe(204);
    expect(await accountLeftovers(user.id)).toEqual(allZero(left));
  });

  it('a deleted user can no longer sign in', async () => {
    const user = await fresh();
    expect((await del(user, { confirm: 'DELETE' })).status).toBe(204);
    await expect(signedInClient(user)).rejects.toThrow();
    expect(await sql('select 1 from auth.users where id = $1', [user.id])).toHaveLength(0);
  });
});
