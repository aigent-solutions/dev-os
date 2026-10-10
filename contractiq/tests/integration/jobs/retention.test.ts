import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRetention, type RetentionSummary } from '@/server/services/retention.service';
import { closeDb, count, sql } from '../../helpers/db';
import { contractPath, createTestUser, deleteTestUser, seedContract, uploadObject } from '../../helpers/factories';
import { adminClient } from '../../helpers/supabase';

// 13-data-lifecycle-gdpr.md §12 — the daily retention job against real Postgres + Storage.
const objectExists = (path: string) => count(`select count(*) from storage.objects where bucket_id = 'contracts' and name = $1`, [path]);
const ageObject = (path: string, hours: number) =>
  sql(`update storage.objects set created_at = now() - make_interval(hours => $2) where bucket_id = 'contracts' and name = $1`, [path, hours]);

let userId: string;
const s = {} as {
  expired: { id: string; path: string };
  fresh: { id: string; path: string };
  pending: { id: string; path: string };
  orphanOld: string;
  orphanNew: string;
  nonUuidOld: string;
};
let first: RetentionSummary;
let second: RetentionSummary;

beforeAll(async () => {
  const user = await createTestUser();
  userId = user.id;
  const admin = adminClient();

  // Expired: last accessed 91 days ago, with a PDF.
  const expired = await seedContract(userId);
  s.expired = { id: expired.id, path: contractPath(userId, expired.id) };
  // Fresh: accessed now, with a PDF.
  const fresh = await seedContract(userId);
  s.fresh = { id: fresh.id, path: contractPath(userId, fresh.id) };
  // Abandoned upload: pending_upload created 25 h ago, with a PDF.
  const pending = await seedContract(userId, { status: 'pending_upload', contract_text: null, page_count: null, word_count: null, token_count: null });
  s.pending = { id: pending.id, path: contractPath(userId, pending.id) };
  for (const c of [s.expired, s.fresh, s.pending]) {
    await uploadObject(c.path);
    const { error } = await admin.from('contracts').update({ file_path: c.path }).eq('id', c.id);
    if (error) throw error;
  }
  await sql(`update public.contracts set last_accessed_at = now() - interval '91 days' where id = $1`, [s.expired.id]);
  await sql(`update public.contracts set created_at = now() - interval '25 hours' where id = $1`, [s.pending.id]);

  // Orphans: objects whose contract row doesn't exist, one 25 h old and one 1 h old.
  s.orphanOld = `${userId}/${randomUUID()}/contract.pdf`;
  s.orphanNew = `${userId}/${randomUUID()}/contract.pdf`;
  s.nonUuidOld = `${userId}/not-a-uuid/contract.pdf`;
  for (const p of [s.orphanOld, s.orphanNew, s.nonUuidOld]) await uploadObject(p);
  await ageObject(s.orphanOld, 25);
  await ageObject(s.nonUuidOld, 25);

  // Rate-limit windows: one 3 days old (pruned), one current (kept).
  await admin.from('rate_limits').insert([
    { user_id: userId, bucket: 'upload', window_start: new Date(Date.now() - 3 * 86_400_000).toISOString(), count: 1 },
    { user_id: userId, bucket: 'chat', window_start: new Date().toISOString(), count: 1 },
  ]);

  first = await runRetention();
  second = await runRetention();
});
afterAll(async () => {
  await deleteTestUser(userId);
  await closeDb();
});

describe('runRetention', () => {
  it('expired PDF: object removed, file_path cleared, file_deleted_at set; the row and its text stay', async () => {
    expect(await objectExists(s.expired.path)).toBe(0);
    const [row] = await sql<{ file_path: string | null; file_deleted_at: Date | null; contract_text: string | null }>(
      'select file_path, file_deleted_at, contract_text from public.contracts where id = $1',
      [s.expired.id],
    );
    expect(row).toMatchObject({ file_path: null });
    expect(row!.file_deleted_at).not.toBeNull();
    expect(row!.contract_text).not.toBeNull();
  });

  it('fresh contract: untouched', async () => {
    expect(await objectExists(s.fresh.path)).toBe(1);
    const [row] = await sql<{ file_path: string | null }>('select file_path from public.contracts where id = $1', [s.fresh.id]);
    expect(row!.file_path).toBe(s.fresh.path);
  });

  it('25-hour-old pending_upload: row and object deleted', async () => {
    expect(await count('select count(*) from public.contracts where id = $1', [s.pending.id])).toBe(0);
    expect(await objectExists(s.pending.path)).toBe(0);
  });

  it('orphan objects: removed when older than 24 h, kept when newer; non-UUID folders never touched', async () => {
    expect(await objectExists(s.orphanOld)).toBe(0);
    expect(await objectExists(s.orphanNew)).toBe(1);
    expect(await objectExists(s.nonUuidOld)).toBe(1);
  });

  it('rate_limits: windows older than 2 days pruned, current kept', async () => {
    const rows = await sql<{ bucket: string }>('select bucket from public.rate_limits where user_id = $1', [userId]);
    expect(rows.map((r) => r.bucket)).toEqual(['chat']);
  });

  it('the first run reports what it did', () => {
    expect(first.expiredPdfs).toMatchObject({ removed: 1, failed: 0 });
    expect(first.pendingSweep).toMatchObject({ rowsDeleted: 1, objectsRemoved: 1 });
    expect(first.orphanSweep.objectsRemoved).toBeGreaterThanOrEqual(1);
    expect(first.rateLimitsPruned).toBeGreaterThanOrEqual(1);
  });

  it('running again changes nothing', () => {
    expect(second.expiredPdfs).toMatchObject({ removed: 0, skippedPathMismatch: 0, failed: 0 });
    expect(second.pendingSweep).toMatchObject({ rowsDeleted: 0, objectsRemoved: 0 });
    expect(second.orphanSweep.objectsRemoved).toBe(0);
    expect(second.rateLimitsPruned).toBe(0);
  });
});
