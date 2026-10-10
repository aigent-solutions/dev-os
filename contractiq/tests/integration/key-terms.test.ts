import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keyTermRoute from '@/app/api/key-terms/[id]/route';
import { closeDb, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract, seedKeyTerm } from '../helpers/factories';
import { callRoute, signedInClient } from '../helpers/supabase';
import type { SeededUser } from '../setup/seed-users';

// 08-inline-editing.md §12 — PATCH /api/key-terms/{id} and the column grants, on the local stack.
const created: string[] = [];
async function termOwner(over = {}) {
  const user = await createTestUser();
  created.push(user.id);
  const c = await seedContract(user.id, { page_count: 2, ...over });
  const t = await seedKeyTerm(c.id, user.id, { value: 'England and Wales', page_number: 2 });
  return { user, contractId: c.id, termId: t.id };
}
const patch = (user: SeededUser, id: string, body: unknown) => callRoute(keyTermRoute.PATCH, { method: 'PATCH', path: `/api/key-terms/${id}`, params: { id }, body, user });
const row = async (id: string) =>
  (await sql<{ value: string; page_number: number; is_edited: boolean; original_value: string | null; original_page_number: number | null; edited_at: Date | null; confidence_score: number }>(
    'select value, page_number, is_edited, original_value, original_page_number, edited_at, confidence_score from public.key_terms where id = $1', [id],
  ))[0]!;

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('PATCH /api/key-terms/{id}', () => {
  it('owner → 200; the trigger keeps the AI value as the original', async () => {
    const { user, termId } = await termOwner();
    const res = await patch(user, termId, { value: 'Scotland', page_number: 1 });
    expect(res.status).toBe(200);
    expect(await row(termId)).toMatchObject({ value: 'Scotland', page_number: 1, is_edited: true, original_value: 'England and Wales', original_page_number: 2 });
    expect((await row(termId)).edited_at).not.toBeNull();
  });

  it('a second edit keeps the first original and moves edited_at forward', async () => {
    const { user, termId } = await termOwner();
    await patch(user, termId, { value: 'Scotland' });
    const first = await row(termId);
    await new Promise((r) => setTimeout(r, 20));
    await patch(user, termId, { value: 'Wales' });
    const second = await row(termId);
    expect(second.original_value).toBe('England and Wales');
    expect(second.edited_at!.getTime()).toBeGreaterThan(first.edited_at!.getTime());
  });

  it('another user → 404 and the row is unchanged', async () => {
    const { termId } = await termOwner();
    const other = await createTestUser();
    created.push(other.id);
    const before = await row(termId);
    expect((await patch(other, termId, { value: 'pwned' })).status).toBe(404);
    expect(await row(termId)).toEqual(before);
  });

  it('page_number beyond the contract → 400 with details.page_number', async () => {
    const { user, termId } = await termOwner();
    const res = await patch(user, termId, { value: 'x', page_number: 3 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { details: Record<string, string> } }).error.details).toHaveProperty('page_number');
  });

  it('a contract in error → 409', async () => {
    const { user, termId } = await termOwner({ status: 'error' });
    expect((await patch(user, termId, { value: 'x' })).status).toBe(409);
  });

  it('{ value, confidence_score } → 400 (strict body)', async () => {
    const { user, termId } = await termOwner();
    expect((await patch(user, termId, { value: 'x', confidence_score: 99 })).status).toBe(400);
    expect((await row(termId)).confidence_score).toBe(90);
  });
});

describe('direct PostgREST with the user JWT', () => {
  it('cannot update confidence_score (column grant)', async () => {
    const { user, termId } = await termOwner();
    const { error } = await (await signedInClient(user)).from('key_terms').update({ confidence_score: 99 } as never).eq('id', termId);
    expect(error?.code ?? error?.message).toMatch(/42501|permission denied/);
    expect((await row(termId)).confidence_score).toBe(90);
  });

  it('cannot insert key_terms', async () => {
    const { user, contractId } = await termOwner();
    const { error } = await (await signedInClient(user)).from('key_terms').insert({
      contract_id: contractId, user_id: user.id, term_key: 'parties', term_name: 'Parties', confidence_score: 99, display_order: 9,
    } as never);
    expect(error).not.toBeNull();
  });
});

describe('term_corrections view', () => {
  it('the owner sees their edited row; another user sees none', async () => {
    const { user, termId } = await termOwner();
    await patch(user, termId, { value: 'Scotland' });
    const mine = await (await signedInClient(user)).from('term_corrections').select('*');
    expect(mine.error).toBeNull();
    expect(mine.data!.length).toBeGreaterThanOrEqual(1);
    const other = await createTestUser();
    created.push(other.id);
    const theirs = await (await signedInClient(other)).from('term_corrections').select('*');
    expect(theirs.data ?? []).toHaveLength(0);
  });
});
