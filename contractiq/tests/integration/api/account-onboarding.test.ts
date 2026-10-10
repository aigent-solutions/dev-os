import { afterAll, describe, expect, it } from 'vitest';
import { PATCH } from '@/app/api/account/route';
import { closeDb, sql } from '../../helpers/db';
import { createTestUser, deleteTestUser } from '../../helpers/factories';
import { callRoute } from '../../helpers/supabase';

// 14-onboarding-a11y.md §13 — PATCH /api/account { onboarding_completed: true }.
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
const completedAt = async (id: string) =>
  ((await sql<{ t: Date | null }>('select onboarding_completed_at t from public.profiles where id = $1', [id]))[0]!.t);

describe('onboarding completion', () => {
  it('sets onboarding_completed_at; a second call keeps the first timestamp', async () => {
    const user = await fresh();
    const first = await callRoute(PATCH, { method: 'PATCH', path: '/api/account', body: { onboarding_completed: true }, user });
    expect(first.status).toBe(200);
    const t1 = await completedAt(user.id);
    expect(t1).not.toBeNull();
    expect(((await first.json()) as { onboarding_completed_at: string }).onboarding_completed_at).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    const second = await callRoute(PATCH, { method: 'PATCH', path: '/api/account', body: { onboarding_completed: true }, user });
    expect(second.status).toBe(200);
    expect((await completedAt(user.id))!.toISOString()).toBe(t1!.toISOString());
  });

  it('{ onboarding_completed: false } → 400 (tips cannot be reset)', async () => {
    const user = await fresh();
    const res = await callRoute(PATCH, { method: 'PATCH', path: '/api/account', body: { onboarding_completed: false }, user });
    expect(res.status).toBe(400);
  });

  it('no session → 401', async () => {
    const res = await callRoute(PATCH, { method: 'PATCH', path: '/api/account', body: { onboarding_completed: true } });
    expect(res.status).toBe(401);
  });

  it("another user's profile is unaffected", async () => {
    const [a, b] = [await fresh(), await fresh()];
    await callRoute(PATCH, { method: 'PATCH', path: '/api/account', body: { onboarding_completed: true }, user: a });
    expect(await completedAt(b.id)).toBeNull();
  });
});
