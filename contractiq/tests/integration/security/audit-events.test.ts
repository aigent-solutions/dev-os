import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountRoute from '@/app/api/account/route';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import * as contractsRoute from '@/app/api/contracts/route';
import { closeDb, count, sql } from '../../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../../helpers/factories';
import { adminClient, callRoute } from '../../helpers/supabase';
import { runRetention } from '@/server/services/retention.service';

// Stage 7 #3 — the durable audit trail, through the real routes and the local stack.
type Row = { event: string; actor_user_id: string | null; target_type: string | null; target_id: string | null; request_id: string | null; metadata: Record<string, unknown> };
const eventsFor = (userId: string) =>
  sql<Row>('select event, actor_user_id, target_type, target_id, request_id, metadata from public.audit_events where actor_user_id = $1 order by id', [userId]);
const created: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  created.push(u.id);
  return u;
};
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(async () => {
  await Promise.all(created.map((id) => deleteTestUser(id).catch(() => undefined)));
  await closeDb();
});

describe('audit_events written by the routes', () => {
  it('upload → contract.uploaded with type and size, never the file name; request_id matches the response', async () => {
    const user = await fresh();
    const res = await callRoute(contractsRoute.POST, {
      method: 'POST', path: '/api/contracts', user,
      body: { file_name: 'Confidential Acme Merger NDA.pdf', file_size: 4321, contract_type: 'nda' },
    });
    expect(res.status).toBe(201);
    const { contract_id } = (await res.json()) as { contract_id: string };
    const [row] = await eventsFor(user.id);
    expect(row).toEqual({
      event: 'contract.uploaded', actor_user_id: user.id, target_type: 'contract', target_id: contract_id,
      request_id: res.headers.get('x-request-id'), metadata: { contract_type: 'nda', file_size: 4321 },
    });
    expect(JSON.stringify(row)).not.toMatch(/Acme|Merger/);
  });

  it('delete → contract.deleted', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const res = await callRoute(contractRoute.DELETE, { method: 'DELETE', path: `/api/contracts/${c.id}`, params: { id: c.id }, user });
    expect(res.status).toBe(204);
    expect(await eventsFor(user.id)).toEqual([expect.objectContaining({ event: 'contract.deleted', target_type: 'contract', target_id: c.id })]);
  });

  it('a failed delete (not the owner) writes nothing', async () => {
    const owner = await fresh();
    const other = await fresh();
    const c = await seedContract(owner.id);
    const res = await callRoute(contractRoute.DELETE, { method: 'DELETE', path: `/api/contracts/${c.id}`, params: { id: c.id }, user: other });
    expect(res.status).toBe(404);
    expect(await eventsFor(other.id)).toEqual([]);
  });

  it('data-sharing consent changes → account.data_sharing_updated with the new value; a name change alone → nothing', async () => {
    const user = await fresh();
    await callRoute(accountRoute.PATCH, { method: 'PATCH', path: '/api/account', body: { full_name: 'Sam' }, user });
    expect(await eventsFor(user.id)).toEqual([]);
    for (const value of [false, true]) {
      const res = await callRoute(accountRoute.PATCH, { method: 'PATCH', path: '/api/account', body: { feedback_opt_in: value }, user });
      expect(res.status).toBe(200);
    }
    expect((await eventsFor(user.id)).map((r) => [r.event, r.metadata])).toEqual([
      ['account.data_sharing_updated', { feedback_opt_in: false }],
      ['account.data_sharing_updated', { feedback_opt_in: true }],
    ]);
  });

  it('account deletion → account.deleted, and the row outlives the account (no FK, no email)', async () => {
    const user = await fresh();
    const res = await callRoute(accountRoute.DELETE, { method: 'DELETE', path: '/api/account', body: { confirm: 'DELETE' }, user });
    expect(res.status).toBe(204);
    expect(await count('select count(*) from auth.users where id = $1', [user.id])).toBe(0);
    const rows = await eventsFor(user.id);
    expect(rows.map((r) => r.event)).toEqual(['account.deleted']);
    expect(JSON.stringify(rows)).not.toContain(user.email);
  });
});

describe('retention', () => {
  it('the daily job prunes audit rows older than 365 days and keeps newer ones', async () => {
    const user = await fresh();
    const admin = adminClient();
    const old = new Date(Date.now() - 366 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 364 * 86_400_000).toISOString();
    const { error } = await admin.from('audit_events').insert([
      { event: 'contract.deleted', actor_user_id: user.id, occurred_at: old },
      { event: 'contract.uploaded', actor_user_id: user.id, occurred_at: recent },
    ]);
    if (error) throw error;
    const summary = await runRetention();
    expect(summary.auditEventsPruned).toBeGreaterThanOrEqual(1);
    expect((await eventsFor(user.id)).map((r) => r.event)).toEqual(['contract.uploaded']);
  });
});
