import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountRoute from '@/app/api/account/route';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import * as contractsRoute from '@/app/api/contracts/route';
import { closeDb, count } from '../../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../../helpers/factories';
import { callRoute } from '../../helpers/supabase';

// Stage 7 #4 — through the real routes and the local stack: a signed-in user's browser, tricked by another
// site, can't create, change or delete anything; the same requests from this site still work.
const EVIL = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
const SAME = { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
const created: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  created.push(u.id);
  return u;
};
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});
const upload = { file_name: 'x.pdf', file_size: 1000, contract_type: 'nda' };

describe('cross-site writes are refused before any change', () => {
  it('POST /api/contracts from another site → 403, no row', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: upload, user, headers: EVIL });
    expect(res.status).toBe(403);
    expect(await count('select count(*) from public.contracts where user_id = $1', [user.id])).toBe(0);
  });

  it('DELETE /api/contracts/{id} from another site → 403, the contract survives', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const res = await callRoute(contractRoute.DELETE, { method: 'DELETE', path: `/api/contracts/${c.id}`, params: { id: c.id }, user, headers: EVIL });
    expect(res.status).toBe(403);
    expect(await count('select count(*) from public.contracts where id = $1', [c.id])).toBe(1);
  });

  it('DELETE /api/account from another site → 403, the account survives', async () => {
    const user = await fresh();
    const res = await callRoute(accountRoute.DELETE, { method: 'DELETE', path: '/api/account', body: { confirm: 'DELETE' }, user, headers: EVIL });
    expect(res.status).toBe(403);
    expect(await count('select count(*) from auth.users where id = $1', [user.id])).toBe(1);
  });

  it('a text/plain body (what a cross-site <form> can send) → 415, no row', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: upload, user, headers: { 'content-type': 'text/plain' } });
    expect(res.status).toBe(415);
    expect(await count('select count(*) from public.contracts where user_id = $1', [user.id])).toBe(0);
  });
});

describe('same-origin writes still work', () => {
  it('POST /api/contracts from this site → 201', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: upload, user, headers: SAME });
    expect(res.status).toBe(201);
  });

  it('PATCH /api/contracts/{id} from this site → 200', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const res = await callRoute(contractRoute.PATCH, { method: 'PATCH', path: `/api/contracts/${c.id}`, params: { id: c.id }, body: { file_name: 'Renamed.pdf' }, user, headers: SAME });
    expect(res.status).toBe(200);
  });
});
