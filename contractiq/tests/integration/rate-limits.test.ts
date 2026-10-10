import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as contractsRoute from '@/app/api/contracts/route';
import * as keyTermRoute from '@/app/api/key-terms/[id]/route';
import type { Database } from '@/types/database.types';
import { closeDb, count, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract, seedKeyTerm } from '../helpers/factories';
import { adminClient, callRoute, signedInClient } from '../helpers/supabase';

// 12-rate-limiting-usage.md §12 — fixed-window limits and the server-only privileges, on the local stack.
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

/** Windows are aligned to the clock; don't start a burst within `margin` s of the next boundary. */
async function awayFromWindowEdge(windowSeconds: number, margin = 10) {
  const left = windowSeconds - ((Date.now() / 1000) % windowSeconds);
  if (left < margin) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
}
const denied = (error: { code?: string; message: string } | null) => !!error && (error.code === '42501' || /permission denied/i.test(error.message));

describe('check_rate_limit (service role)', () => {
  it('20 calls allowed, the 21st refused with remaining 0; reset_at = window start + window', async () => {
    const user = await fresh();
    await awayFromWindowEdge(3600);
    const call = () => adminClient().rpc('check_rate_limit', { p_user_id: user.id, p_bucket: 'upload', p_limit: 20, p_window_seconds: 3600 }).single();
    for (let i = 1; i <= 20; i++) {
      const { data } = await call();
      expect(data, `call ${i}`).toMatchObject({ allowed: true, remaining: 20 - i });
    }
    const { data } = await call();
    expect(data).toMatchObject({ allowed: false, remaining: 0 });
    const windowStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    expect(new Date(data!.reset_at).getTime()).toBe(windowStart + 3_600_000);
  });
});

describe('API limits', () => {
  it('POST /api/contracts: the 21st upload in an hour → 429 with Retry-After, and no 21st row', async () => {
    const user = await fresh();
    await awayFromWindowEdge(3600);
    const create = () => callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: { file_name: 'a.pdf', file_size: 1000, contract_type: 'nda' }, user });
    for (let i = 0; i < 20; i++) expect((await create()).status, `upload ${i + 1}`).toBe(201);
    const res = await create();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect(await count('select count(*) from public.contracts where user_id = $1', [user.id])).toBe(20);
  });

  it('PATCH /api/key-terms: request 121 in a minute → 429 (window pre-filled to 120)', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const term = await seedKeyTerm(c.id, user.id);
    await awayFromWindowEdge(60, 5);
    await sql(
      `insert into public.rate_limits (user_id, bucket, window_start, count)
       values ($1, 'edit', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 120)`,
      [user.id],
    );
    const res = await callRoute(keyTermRoute.PATCH, { method: 'PATCH', path: `/api/key-terms/${term.id}`, params: { id: term.id }, body: { value: 'Scotland' }, user });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await count("select count(*) from public.key_terms where id = $1 and value = 'Scotland'", [term.id])).toBe(0);
  });
});

describe('server-only privileges', () => {
  const anon = () =>
    createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

  describe.each([
    ['user JWT', async () => signedInClient(await fresh())],
    ['anon key', async () => anon()],
  ])('%s', (_label, client) => {
    it.each(['rate_limits', 'ai_usage_logs'] as const)('select and insert on %s are denied', async (table) => {
      const db = await client();
      const sel = await db.from(table).select('*');
      expect(denied(sel.error)).toBe(true);
      const row = table === 'rate_limits'
        ? { user_id: '00000000-0000-4000-8000-000000000000', bucket: 'x', window_start: new Date().toISOString(), count: 1 }
        : { user_id: '00000000-0000-4000-8000-000000000000', operation: 'chat', model: 'x', prompt_version: 'x', latency_ms: 1, success: true };
      expect(denied((await db.from(table).insert(row as never)).error)).toBe(true);
    });

    it('rpc check_rate_limit is denied', async () => {
      const db = await client();
      const { error } = await db.rpc('check_rate_limit', { p_user_id: '00000000-0000-4000-8000-000000000000', p_bucket: 'upload', p_limit: 1, p_window_seconds: 60 });
      expect(denied(error)).toBe(true);
    });

    it.each(['term_correction_rate_7d', 'term_corrections_anonymised', 'contract_analysis_costs'] as const)('select from view %s is denied', async (view) => {
      const db = await client();
      const { error } = await db.from(view).select('*');
      expect(denied(error)).toBe(true);
    });
  });
});
