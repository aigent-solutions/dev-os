import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, filter, type FakeQuery, type FakeResult } from '../../../helpers/fake-supabase';

// 13-data-lifecycle-gdpr.md §12 — each retention step against a mocked admin client.
let fake: ReturnType<typeof fakeSupabase>;
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => fake.client }));
vi.mock('@/server/services/usage.service', () => ({ runCostBudgetCheck: vi.fn(async () => 'ok'), runCorrectionRateCheck: vi.fn(async () => 'ok') }));
const { runRetention } = await import('@/server/services/retention.service');

const NOW = new Date('2026-10-10T03:00:00Z');
const U = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const isStep1Select = (q: FakeQuery) => q.table === 'contracts' && q.op === 'select' && !!filter(q, 'not');
const isStep2Select = (q: FakeQuery) => q.table === 'contracts' && q.op === 'select' && filter(q, 'eq')?.[1] === 'status';

/** Queries with nothing to do, for steps a test doesn't exercise. */
const quiet = (q: FakeQuery): FakeResult => (q.op === 'delete' ? { count: 0 } : { data: [] });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('step 1 — expired PDFs', () => {
  it('removes valid paths, clears path-mismatch rows without a Storage call, and updates every row', async () => {
    const rows = [
      { id: id(1), user_id: U, file_path: `${U}/${id(1)}/contract.pdf` },
      { id: id(2), user_id: U, file_path: `someone-else/${id(2)}/contract.pdf` },
    ];
    let served = false;
    fake = fakeSupabase({
      onQuery: (q) => {
        if (isStep1Select(q)) {
          if (served) return { data: [] };
          served = true;
          return { data: rows };
        }
        return quiet(q);
      },
    });
    const s = await runRetention(NOW);
    const removes = fake.storageCalls.filter((c) => c.method === 'remove').map((c) => c.args[0]);
    expect(removes).toEqual([[`${U}/${id(1)}/contract.pdf`]]);
    const update = fake.queries.find((q) => q.table === 'contracts' && q.op === 'update')!;
    expect(update.payload).toEqual({ file_path: null, file_deleted_at: NOW.toISOString() });
    expect(filter(update, 'in')).toEqual(['in', 'id', [id(1), id(2)]]);
    expect(s.expiredPdfs).toEqual({ removed: 1, skippedPathMismatch: 1, failed: 0 });
  });

  it('cutoff is 90 days before now', async () => {
    fake = fakeSupabase({ onQuery: quiet });
    await runRetention(NOW);
    const q = fake.queries.find(isStep1Select)!;
    expect(filter(q, 'lt')).toEqual(['lt', 'last_accessed_at', new Date(NOW.getTime() - 90 * 86_400_000).toISOString()]);
  });

  it('a Storage error stops the step and leaves the rows untouched', async () => {
    fake = fakeSupabase({
      onQuery: (q) => (isStep1Select(q) ? { data: [{ id: id(1), user_id: U, file_path: `${U}/${id(1)}/contract.pdf` }] } : quiet(q)),
      onStorage: (c) => (c.method === 'remove' ? { error: { message: 'down' } } : {}),
    });
    const s = await runRetention(NOW);
    expect(fake.queries.some((q) => q.table === 'contracts' && q.op === 'update')).toBe(false);
    expect(s.expiredPdfs).toMatchObject({ removed: 0, failed: 1 });
  });
});

describe('step 2 — abandoned uploads', () => {
  it('deletes with a status filter, so a row that became ready is kept', async () => {
    let served = false;
    fake = fakeSupabase({
      onQuery: (q) => {
        if (isStep2Select(q) && !served) {
          served = true;
          return { data: [{ id: id(3), user_id: U, file_path: null }] };
        }
        if (q.table === 'contracts' && q.op === 'delete') return { count: 1 };
        return quiet(q);
      },
    });
    const s = await runRetention(NOW);
    const del = fake.queries.find((q) => q.table === 'contracts' && q.op === 'delete')!;
    expect(filter(del, 'eq')).toEqual(['eq', 'status', 'pending_upload']);
    expect(filter(fake.queries.find(isStep2Select)!, 'lt')).toEqual(['lt', 'created_at', new Date(NOW.getTime() - 24 * 3_600_000).toISOString()]);
    expect(s.pendingSweep.rowsDeleted).toBe(1);
  });
});

describe('step 3 — orphan objects', () => {
  it('skips folders whose contract exists, objects < 24 h old and non-UUID folders', async () => {
    const live = id(10);
    const orphan = id(11);
    const old = new Date(NOW.getTime() - 25 * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    fake = fakeSupabase({
      onQuery: (q) => (q.table === 'contracts' && q.op === 'select' && filter(q, 'in') ? { data: [{ id: live }] } : quiet(q)),
      onStorage: ({ method, args }) => {
        if (method !== 'list') return {};
        const prefix = args[0] as string;
        if (prefix === '') return { data: [{ name: U, id: null, created_at: null }, { name: 'not-a-uuid', id: null, created_at: null }] };
        if (prefix === U) return { data: [{ name: live, id: null, created_at: null }, { name: orphan, id: null, created_at: null }, { name: 'tmp', id: null, created_at: null }] };
        if (prefix === `${U}/${orphan}`) return { data: [{ name: 'old.pdf', id: 'a', created_at: old }, { name: 'new.pdf', id: 'b', created_at: recent }] };
        return { data: [] };
      },
    });
    const s = await runRetention(NOW);
    const listed = fake.storageCalls.filter((c) => c.method === 'list').map((c) => c.args[0]);
    expect(listed).not.toContain(`${U}/${live}`); // existing contract folder never listed
    expect(listed).not.toContain('not-a-uuid');
    expect(listed).not.toContain(`${U}/tmp`);
    const removed = fake.storageCalls.filter((c) => c.method === 'remove').flatMap((c) => c.args[0] as string[]);
    expect(removed).toEqual([`${U}/${orphan}/old.pdf`]);
    expect(s.orphanSweep).toMatchObject({ foldersScanned: 1, objectsRemoved: 1, truncated: false });
  });
});

describe('step 4 — rate limits', () => {
  it('prunes windows older than now − 2 days', async () => {
    fake = fakeSupabase({ onQuery: (q) => (q.table === 'rate_limits' ? { count: 7 } : quiet(q)) });
    const s = await runRetention(NOW);
    const q = fake.queries.find((x) => x.table === 'rate_limits')!;
    expect(q.op).toBe('delete');
    expect(filter(q, 'lt')).toEqual(['lt', 'window_start', new Date(NOW.getTime() - 2 * 86_400_000).toISOString()]);
    expect(s.rateLimitsPruned).toBe(7);
  });
});

describe('step 5 — audit_events (Stage 7)', () => {
  it('prunes audit rows older than now − 365 days', async () => {
    fake = fakeSupabase({ onQuery: (q) => (q.table === 'audit_events' ? { count: 4 } : quiet(q)) });
    const s = await runRetention(NOW);
    const q = fake.queries.find((x) => x.table === 'audit_events')!;
    expect(q.op).toBe('delete');
    expect(filter(q, 'lt')).toEqual(['lt', 'occurred_at', new Date(NOW.getTime() - 365 * 86_400_000).toISOString()]);
    expect(s.auditEventsPruned).toBe(4);
  });

  it('a failing audit prune is isolated: the later checks still run', async () => {
    fake = fakeSupabase({
      onQuery: (q) => {
        if (q.table === 'audit_events') throw new Error('db down');
        return quiet(q);
      },
    });
    const s = await runRetention(NOW);
    expect(s.auditEventsPruned).toBe(0);
    expect(s.costCheck).toBe('ok');
    expect(s.correctionRateCheck).toBe('ok');
  });
});

describe('isolation between steps', () => {
  it('a failing step does not stop the later ones', async () => {
    fake = fakeSupabase({
      onQuery: (q) => {
        if (isStep1Select(q)) throw new Error('db down');
        if (q.table === 'rate_limits') return { count: 2 };
        return quiet(q);
      },
    });
    const s = await runRetention(NOW);
    expect(s.rateLimitsPruned).toBe(2);
    expect(s.costCheck).toBe('ok');
    expect(s.correctionRateCheck).toBe('ok');
  });

  it('returns the full summary shape', async () => {
    fake = fakeSupabase({ onQuery: quiet });
    const s = await runRetention(NOW);
    expect(Object.keys(s).sort()).toEqual(['auditEventsPruned', 'correctionRateCheck', 'costCheck', 'durationMs', 'expiredPdfs', 'orphanSweep', 'pendingSweep', 'rateLimitsPruned']);
  });
});
