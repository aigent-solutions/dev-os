import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as contractsRoute from '@/app/api/contracts/route';
import * as summaryRoute from '@/app/api/dashboard/summary/route';
import type { ContractListItem, DashboardSummary, ListContractsResponse } from '@/types/api';
import { closeDb, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract, seedKeyTerm } from '../helpers/factories';
import { callRoute } from '../helpers/supabase';
import type { SeededUser } from '../setup/seed-users';

// 10-dashboard.md §12 — summary + list on the local stack.
let user: SeededUser;
let other: SeededUser;
const ids: Record<string, string> = {};

beforeAll(async () => {
  [user, other] = [await createTestUser(), await createTestUser()];
  const seeds: [string, Parameters<typeof seedContract>[1]][] = [
    ['nda-a', { file_name: 'Alpha NDA.pdf', contract_type: 'nda' }],
    ['nda-b', { file_name: 'Bravo NDA.pdf', contract_type: 'nda' }],
    ['nda-c', { file_name: 'Charlie NDA.pdf', contract_type: 'nda', review_completed_at: new Date().toISOString() }],
    ['msa-a', { file_name: 'Delta MSA.pdf', contract_type: 'msa' }],
    ['msa-b', { file_name: 'Echo MSA.pdf', contract_type: 'msa' }],
    ['pending', { file_name: 'Pending.pdf', contract_type: 'nda', status: 'pending_upload', contract_text: null, page_count: null, word_count: null, token_count: null }],
  ];
  for (const [i, [key, over]] of seeds.entries()) {
    ids[key] = (await seedContract(user.id, over)).id;
    await sql(`update public.contracts set created_at = now() - make_interval(mins => $2) where id = $1`, [ids[key], 60 - i]); // later seeds are newer
  }
  // Low-confidence terms: Alpha has 2 (< 50), Delta has 0.
  await seedKeyTerm(ids['nda-a']!, user.id, { term_key: 'parties', confidence_score: 30 });
  await seedKeyTerm(ids['nda-a']!, user.id, { term_key: 'governing_law', confidence_score: 49 });
  await seedKeyTerm(ids['nda-a']!, user.id, { term_key: 'jurisdiction', confidence_score: 50 });
  await seedKeyTerm(ids['msa-a']!, user.id, { term_key: 'parties', confidence_score: 95 });
  await seedContract(other.id, { file_name: 'Other user NDA.pdf' });
});
beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
afterAll(async () => {
  await Promise.all([user, other].map((u) => deleteTestUser(u.id)));
  await closeDb();
});

const list = async (u: SeededUser, qs: string) => {
  const res = await callRoute(contractsRoute.GET, { path: `/api/contracts?${qs}`, user: u });
  return { status: res.status, body: (await res.json()) as ListContractsResponse };
};

describe('GET /api/dashboard/summary', () => {
  it('counts by type and reviewed; recent = 5 newest; pending_upload excluded', async () => {
    const res = await callRoute(summaryRoute.GET, { path: '/api/dashboard/summary', user });
    const s = (await res.json()) as DashboardSummary;
    expect(s).toMatchObject({ total: 5, by_type: { nda: 3, msa: 2 }, reviewed: 1 });
    expect(s.recent.map((r) => r.id)).toEqual([ids['msa-b'], ids['msa-a'], ids['nda-c'], ids['nda-b'], ids['nda-a']]);
    expect(s.recent.some((r) => r.id === ids.pending)).toBe(false);
  });

  it("another user sees none of these contracts", async () => {
    const s = (await (await callRoute(summaryRoute.GET, { path: '/api/dashboard/summary', user: other })).json()) as DashboardSummary;
    expect(s.total).toBe(1);
    expect(JSON.stringify(s)).not.toContain(ids['nda-a']);
  });
});

describe('GET /api/contracts', () => {
  it('sort=file_name asc, type=nda, page 2 of size 2 → the right slice and the NDA total', async () => {
    const { status, body } = await list(user, 'sort=file_name&order=asc&type=nda&page=2&page_size=2');
    expect(status).toBe(200);
    expect(body).toMatchObject({ page: 2, page_size: 2, total: 3 });
    expect(body.items.map((i) => i.file_name)).toEqual(['Charlie NDA.pdf']);
  });

  it('default order is newest first, without pending_upload or contract_text', async () => {
    const { body } = await list(user, '');
    expect(body.items.map((i) => i.id)).toEqual([ids['msa-b'], ids['msa-a'], ids['nda-c'], ids['nda-b'], ids['nda-a']]);
    expect(Object.keys(body.items[0]!)).not.toContain('contract_text');
  });

  it('low_confidence_count = key terms with confidence < 50', async () => {
    const { body } = await list(user, '');
    const byId = Object.fromEntries(body.items.map((i: ContractListItem) => [i.id, i.low_confidence_count]));
    expect(byId[ids['nda-a']!]).toBe(2);
    expect(byId[ids['msa-a']!]).toBe(0);
  });

  it('sort=user_id → 400 VALIDATION_ERROR', async () => {
    const res = await callRoute(contractsRoute.GET, { path: '/api/contracts?sort=user_id', user });
    expect(res.status).toBe(400);
  });

  it('a page past the end → items: [] with the real total', async () => {
    const { body } = await list(user, 'page=9');
    expect(body).toMatchObject({ items: [], total: 5 });
  });

  it('another user sees only their own contract', async () => {
    const { body } = await list(other, '');
    expect(body.items.map((i) => i.file_name)).toEqual(['Other user NDA.pdf']);
  });
});
