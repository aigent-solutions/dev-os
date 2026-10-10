import { http, HttpResponse } from 'msw';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as processRoute from '@/app/api/contracts/[id]/process/route';
import { closeDb, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../helpers/factories';
import { callRoute, signedInClient } from '../helpers/supabase';
import { server } from '../setup/msw';
import type { SeededUser } from '../setup/seed-users';

// 04-term-preview-custom-terms.md §12 — custom terms are persisted by /process (background mode, dispatch mocked).
const FIVE = ['Audit rights', 'Insurance requirements', 'Force majeure', 'Assignment rights', 'Limitation on publicity'];
const created: string[] = [];
async function readyContract() {
  const user = await createTestUser();
  created.push(user.id);
  return { user, id: (await seedContract(user.id, { status: 'ready' })).id };
}
const process = (user: SeededUser, id: string, custom_terms: string[]) =>
  callRoute(processRoute.POST, { method: 'POST', path: `/api/contracts/${id}/process`, params: { id }, body: { custom_terms }, user });
const rows = (id: string) =>
  sql<{ id: string; term_name: string; is_manual: boolean }>('select id, term_name, is_manual from public.custom_key_terms where contract_id = $1 order by created_at, id', [id]);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  server.use(http.post('http://localhost:3000/.netlify/functions/process-contract-background', () => new HttpResponse(null, { status: 202 })));
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('custom terms via /process', () => {
  it('5 valid terms → 5 rows in order, is_manual = true', async () => {
    const { user, id } = await readyContract();
    expect((await process(user, id, FIVE)).status).toBe(202);
    const r = await rows(id);
    expect(r.map((x) => x.term_name)).toEqual(FIVE);
    expect(r.every((x) => x.is_manual)).toBe(true);
  });

  it('6 terms → 400 and nothing is stored or claimed', async () => {
    const { user, id } = await readyContract();
    const res = await process(user, id, [...FIVE, 'Audit scope']);
    expect(res.status).toBe(400);
    expect(await rows(id)).toEqual([]);
    expect((await sql<{ status: string }>('select status from public.contracts where id = $1', [id]))[0]!.status).toBe('ready');
  });

  it('a standard-name duplicate → 400 naming the field', async () => {
    const { user, id } = await readyContract();
    const res = await process(user, id, ['Governing Law']);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { details: Record<string, string> } }).error.details).toHaveProperty(['custom_terms.0']);
  });

  it('a retry from error with the same terms → still 5 rows, with new ids', async () => {
    const { user, id } = await readyContract();
    await process(user, id, FIVE);
    const before = (await rows(id)).map((r) => r.id);
    await sql("update public.contracts set status = 'error', error_code = 'OPENAI_UNAVAILABLE' where id = $1", [id]);
    expect((await process(user, id, FIVE)).status).toBe(202);
    const after = await rows(id);
    expect(after.map((r) => r.term_name)).toEqual(FIVE);
    expect(after.some((r) => before.includes(r.id))).toBe(false);
  });
});

describe('database guards (user client)', () => {
  it('a 6th row inserted directly → 23514 (max 5 trigger)', async () => {
    const { user, id } = await readyContract();
    await process(user, id, FIVE);
    const { error } = await (await signedInClient(user)).from('custom_key_terms').insert({ contract_id: id, user_id: user.id, term_name: 'Audit scope' });
    expect(error?.code).toBe('23514');
  });

  it("inserting into another user's contract is an RLS violation", async () => {
    const victim = await readyContract();
    const attacker = await createTestUser();
    created.push(attacker.id);
    const { error } = await (await signedInClient(attacker)).from('custom_key_terms').insert({ contract_id: victim.id, user_id: attacker.id, term_name: 'Planted term' });
    expect(error).not.toBeNull();
    expect(await rows(victim.id)).toEqual([]);
  });
});
