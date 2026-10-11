import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountRoute from '@/app/api/account/route';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import * as contractsRoute from '@/app/api/contracts/route';
import * as keyTermRoute from '@/app/api/key-terms/[id]/route';
import { closeDb, count } from '../../helpers/db';
import { createTestUser, deleteTestUser, seedContract, seedKeyTerm } from '../../helpers/factories';
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

// The live incident: Kelsey's edit from the Netlify branch address main--contractiq2026.netlify.app was refused,
// because on Netlify req.url doesn't carry that hostname. Requests here go to http://localhost:3000, so the
// Origin and Host differ from req.url exactly as they did in production.
describe('writes from another hostname of this site (Netlify main--… branch address)', () => {
  const BRANCH = { origin: 'https://main--contractiq2026.netlify.app', host: 'main--contractiq2026.netlify.app' };

  it('the failing request as the browser sent it (Sec-Fetch-Site: same-origin) → key-term edit saves, 200', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const term = await seedKeyTerm(c.id, user.id);
    const res = await callRoute(keyTermRoute.PATCH, {
      method: 'PATCH', path: `/api/key-terms/${term.id}`, params: { id: term.id }, user,
      body: { value: 'Scotland' }, headers: { ...BRANCH, 'sec-fetch-site': 'same-origin' },
    });
    expect(res.status).toBe(200);
    expect(await count("select count(*) from public.key_terms where id = $1 and value = 'Scotland'", [term.id])).toBe(1);
  });

  it('an older browser without Sec-Fetch-Site: Origin matches the Host header → upload created, 201', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: upload, user, headers: BRANCH });
    expect(res.status).toBe(201);
  });

  it('…but a foreign Origin on that same Host is still refused, 403, nothing created', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, {
      method: 'POST', path: '/api/contracts', body: upload, user, headers: { origin: 'https://evil.example', host: BRANCH.host },
    });
    expect(res.status).toBe(403);
    expect(await count('select count(*) from public.contracts where user_id = $1', [user.id])).toBe(0);
  });
});

