import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as feedbackRoute from '@/app/api/contracts/[id]/feedback/route';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import { closeDb, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../helpers/factories';
import { callRoute, signedInClient } from '../helpers/supabase';
import type { SeededUser } from '../setup/seed-users';

// 11-feedback.md §12 — PUT /api/contracts/{id}/feedback on the local stack.
const created: string[] = [];
async function owner(status: 'completed' | 'processing' = 'completed') {
  const user = await createTestUser();
  created.push(user.id);
  return { user, id: (await seedContract(user.id, { status })).id };
}
const put = (user: SeededUser, id: string, body: unknown) => callRoute(feedbackRoute.PUT, { method: 'PUT', path: `/api/contracts/${id}/feedback`, params: { id }, body, user });
const rows = (id: string) =>
  sql<{ id: string; rating: string; comment: string | null; accuracy_rating: string | null; nps_score: number | null; created_at: Date; updated_at: Date }>(
    'select id, rating, comment, accuracy_rating, nps_score, created_at, updated_at from public.user_feedback where contract_id = $1', [id],
  );

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('PUT feedback', () => {
  it('first PUT → 200 and one row; a second PUT updates the same row', async () => {
    const { user, id } = await owner();
    expect((await put(user, id, { rating: 'up', comment: 'Great' })).status).toBe(200);
    const [first] = await rows(id);
    await new Promise((r) => setTimeout(r, 20));
    expect((await put(user, id, { rating: 'down', comment: 'Great' })).status).toBe(200);
    const all = await rows(id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: first!.id, rating: 'down' });
    expect(all[0]!.updated_at.getTime()).toBeGreaterThan(all[0]!.created_at.getTime());
  });

  it('full-replace semantics: a PUT without comment clears a saved comment', async () => {
    const { user, id } = await owner();
    await put(user, id, { rating: 'up', comment: 'Keep me?', accuracy_rating: 'yes' });
    await put(user, id, { rating: 'up' });
    expect((await rows(id))[0]).toMatchObject({ comment: null, accuracy_rating: null });
  });

  it('a seeded nps_score survives a PUT (not client-settable)', async () => {
    const { user, id } = await owner();
    await put(user, id, { rating: 'up' });
    await sql('update public.user_feedback set nps_score = 9 where contract_id = $1', [id]);
    await put(user, id, { rating: 'down', comment: 'changed my mind' });
    expect((await rows(id))[0]!.nps_score).toBe(9);
  });

  it('another user → 404; a direct insert against their contract is an RLS violation', async () => {
    const { id } = await owner();
    const attacker = await createTestUser();
    created.push(attacker.id);
    expect((await put(attacker, id, { rating: 'down' })).status).toBe(404);
    const { error } = await (await signedInClient(attacker)).from('user_feedback').insert({ user_id: attacker.id, contract_id: id, rating: 'down' });
    expect(error).not.toBeNull();
    expect(await rows(id)).toEqual([]);
  });

  it('a contract still processing → 409', async () => {
    const { user, id } = await owner('processing');
    expect((await put(user, id, { rating: 'up' })).status).toBe(409);
  });

  it('the 31st PUT within an hour → 429', async () => {
    const { user, id } = await owner();
    await sql(`insert into public.rate_limits (user_id, bucket, window_start, count) values ($1, 'feedback', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 30)`, [user.id]);
    expect((await put(user, id, { rating: 'up' })).status).toBe(429);
  });

  it('GET /api/contracts/{id} afterwards carries the feedback for prefill', async () => {
    const { user, id } = await owner();
    await put(user, id, { rating: 'down', comment: 'Missed the cap', accuracy_rating: 'partially' });
    const detail = (await (await callRoute(contractRoute.GET, { path: `/api/contracts/${id}`, params: { id }, user })).json()) as { feedback: unknown };
    expect(detail.feedback).toEqual({ rating: 'down', comment: 'Missed the cap', accuracy_rating: 'partially' });
  });
});
