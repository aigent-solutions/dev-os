import 'server-only';
import type { Logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

// Durable audit trail (docs/security/security-plan.md §6; table: supabase/migrations/20261013000000_audit_events.sql).
// Function logs are short-lived; these rows are kept for 365 days. Server only: written with the service role,
// unreadable and unwritable by users (RLS deny-all, no grants).

/** Must match the table's CHECK constraint. */
export type AuditEventName = 'account.deleted' | 'account.data_sharing_updated' | 'contract.uploaded' | 'contract.deleted';

export type AuditEvent = {
  event: AuditEventName;
  actorUserId: string;
  target?: { type: 'account' | 'contract'; id: string };
  requestId?: string;
  /** Facts about the action only: never PII, file names, contract text or term values (00 §6.7 logging rules). */
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Records an event after the action has succeeded. Best-effort by design: a failed audit write is logged at
 * error level (so it shows up in Netlify's function logs) but never undoes or fails the user's action — for
 * deletions the action has already happened and can't be rolled back.
 */
export async function recordAuditEvent(e: AuditEvent, log: Logger): Promise<void> {
  try {
    const { error } = await createAdminSupabase()
      .from('audit_events')
      .insert({
        event: e.event,
        actor_user_id: e.actorUserId,
        target_type: e.target?.type ?? null,
        target_id: e.target?.id ?? null,
        request_id: e.requestId ?? null,
        metadata: (e.metadata ?? {}) as NonNullable<Json>,
      });
    if (error) throw error;
  } catch (err) {
    // Supabase errors are plain objects with a message, not Error instances.
    log.error('audit_write_failed', { event: e.event, error: (err as { message?: string } | null)?.message ?? String(err) });
  }
}
