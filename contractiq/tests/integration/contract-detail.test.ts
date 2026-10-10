import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import { closeDb, sql } from '../helpers/db';
import { contractPath, createTestUser, deleteTestUser, seedContract, seedKeyTerm, uploadObject } from '../helpers/factories';
import { adminClient, callRoute } from '../helpers/supabase';
import type { SeededUser } from '../setup/seed-users';

// 06-results-key-terms-panel.md §12 — GET / PATCH /api/contracts/{id} on the local stack.
const created: string[] = [];
async function owner(over = {}) {
  const user = await createTestUser();
  created.push(user.id);
  const c = await seedContract(user.id, over);
  return { user, id: c.id };
}
const get = (user: SeededUser, id: string) => callRoute(contractRoute.GET, { path: `/api/contracts/${id}`, params: { id }, user });
const patch = (user: SeededUser, id: string, body: unknown) => callRoute(contractRoute.PATCH, { method: 'PATCH', path: `/api/contracts/${id}`, params: { id }, body, user });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('GET /api/contracts/{id}', () => {
  it('owner → 200 with terms ordered by display_order, never file_path or user_id', async () => {
    const { user, id } = await owner();
    await seedKeyTerm(id, user.id, { term_key: 'parties', term_name: 'Parties', display_order: 2 });
    await seedKeyTerm(id, user.id, { term_key: 'effective_date', term_name: 'Effective Date', display_order: 1 });
    const res = await get(user, id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contract: Record<string, unknown>; key_terms: { term_key: string }[] };
    expect(body.key_terms.map((t) => t.term_key)).toEqual(['effective_date', 'parties']);
    expect(body.contract).not.toHaveProperty('file_path');
    expect(body.contract).not.toHaveProperty('user_id');
  });

  it('another user → 404; a malformed id → 404', async () => {
    const { id } = await owner();
    const other = await createTestUser();
    created.push(other.id);
    expect((await get(other, id)).status).toBe(404);
    expect((await get(other, 'not-a-uuid')).status).toBe(404);
  });

  it('a contract stuck processing for 3 min → error PROCESSING_TIMEOUT, and the row is updated', async () => {
    const { user, id } = await owner({ status: 'ready' });
    await sql(`update public.contracts set status = 'processing', processing_attempts = 1, processing_started_at = now() - interval '3 minutes' where id = $1`, [id]);
    const body = (await (await get(user, id)).json()) as { contract: { status: string; error: { code: string } | null } };
    expect(body.contract.status).toBe('error');
    expect(body.contract.error?.code).toBe('PROCESSING_TIMEOUT');
    expect((await sql<{ status: string; error_code: string }>('select status, error_code from public.contracts where id = $1', [id]))[0]).toEqual({ status: 'error', error_code: 'PROCESSING_TIMEOUT' });
  });

  it('a signed pdf_url when the object exists; pdf_url: null (still 200) when it is missing', async () => {
    const { user, id } = await owner();
    const p = contractPath(user.id, id);
    await adminClient().from('contracts').update({ file_path: p }).eq('id', id);
    let body = (await (await get(user, id)).json()) as { pdf_url: string | null };
    expect(body.pdf_url).toBeNull(); // object not uploaded yet
    await uploadObject(p);
    body = (await (await get(user, id)).json()) as { pdf_url: string | null };
    expect(body.pdf_url).toMatch(/token=/);
  });

  it('updates last_accessed_at (drives the 90-day PDF retention)', async () => {
    const { user, id } = await owner();
    await sql(`update public.contracts set last_accessed_at = now() - interval '10 days' where id = $1`, [id]);
    const before = (await sql<{ t: Date }>('select last_accessed_at t from public.contracts where id = $1', [id]))[0]!.t;
    await get(user, id);
    const after = (await sql<{ t: Date }>('select last_accessed_at t from public.contracts where id = $1', [id]))[0]!.t;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe('PATCH /api/contracts/{id}', () => {
  it('review_completed: true twice keeps the first timestamp; false clears it', async () => {
    const { user, id } = await owner();
    const first = (await (await patch(user, id, { review_completed: true })).json()) as { review_completed_at: string };
    expect(first.review_completed_at).not.toBeNull();
    const second = (await (await patch(user, id, { review_completed: true })).json()) as { review_completed_at: string };
    expect(second.review_completed_at).toBe(first.review_completed_at);
    const cleared = (await (await patch(user, id, { review_completed: false })).json()) as { review_completed_at: string | null };
    expect(cleared.review_completed_at).toBeNull();
  });

  it('review_completed on a ready contract → 409', async () => {
    const { user, id } = await owner({ status: 'ready' });
    const res = await patch(user, id, { review_completed: true });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('INVALID_STATUS');
  });

  it.each([[{}], [{ file_name: 'x'.repeat(256) }], [{ review_completed: true, plan: 'pro' }]])('%j → 400', async (body) => {
    const { user, id } = await owner();
    expect((await patch(user, id, body)).status).toBe(400);
  });

  it('renames the display name only (the Storage path never changes)', async () => {
    const { user, id } = await owner();
    await adminClient().from('contracts').update({ file_path: contractPath(user.id, id) }).eq('id', id);
    expect((await patch(user, id, { file_name: 'Renamed.pdf' })).status).toBe(200);
    expect((await sql('select file_name, file_path from public.contracts where id = $1', [id]))[0]).toEqual({ file_name: 'Renamed.pdf', file_path: contractPath(user.id, id) });
  });

  it('over the edit limit → 429', async () => {
    const { user, id } = await owner();
    await sql(`insert into public.rate_limits (user_id, bucket, window_start, count) values ($1, 'edit', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 120)`, [user.id]);
    expect((await patch(user, id, { review_completed: true })).status).toBe(429);
  });
});
