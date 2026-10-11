import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@/lib/logger';

// Stage 7 #3 — recordAuditEvent is best-effort: a failed write is logged at error level, never thrown.
const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => ({ from: () => ({ insert }) }) }));
const { recordAuditEvent } = await import('@/lib/security/auditLog');

beforeEach(() => {
  insert.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
const errors = () => vi.mocked(console.error).mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);

describe('recordAuditEvent', () => {
  it('maps the event to the table columns', async () => {
    insert.mockResolvedValue({ error: null });
    await recordAuditEvent(
      { event: 'contract.deleted', actorUserId: 'u1', target: { type: 'contract', id: 'c1' }, requestId: 'req_x', metadata: { a: 1 } },
      createLogger(),
    );
    expect(insert).toHaveBeenCalledWith({ event: 'contract.deleted', actor_user_id: 'u1', target_type: 'contract', target_id: 'c1', request_id: 'req_x', metadata: { a: 1 } });
  });

  it('a database error is logged (audit_write_failed) and swallowed', async () => {
    insert.mockResolvedValue({ error: { message: 'relation "audit_events" does not exist' } });
    await expect(recordAuditEvent({ event: 'account.deleted', actorUserId: 'u1' }, createLogger())).resolves.toBeUndefined();
    expect(errors()).toEqual([expect.objectContaining({ level: 'error', msg: 'audit_write_failed', event: 'account.deleted', error: 'relation "audit_events" does not exist' })]);
  });

  it('a thrown network error is logged and swallowed too', async () => {
    insert.mockRejectedValue(new Error('fetch failed'));
    await expect(recordAuditEvent({ event: 'contract.uploaded', actorUserId: 'u1' }, createLogger())).resolves.toBeUndefined();
    expect(errors()[0]).toMatchObject({ msg: 'audit_write_failed', error: 'fetch failed' });
  });
});
