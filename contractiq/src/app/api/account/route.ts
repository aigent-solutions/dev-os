import { parseBody } from '@/lib/api/parse';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { recordAuditEvent } from '@/lib/security/auditLog';
import { DeleteAccountSchema, UpdateProfileSchema } from '@/lib/validation/account';
import { deleteAccount, updateProfile } from '@/server/services/account.service';

export const runtime = 'nodejs';

/** PATCH /api/account — name, data-sharing consent, onboarding flag (13 §5.2). Unknown keys → 400. */
export const PATCH = withApiHandler(async (req, { requestId, log }) => {
  const { user, supabase } = await requireUser();
  const input = await parseBody(req, UpdateProfileSchema);
  const profile = await updateProfile(supabase, user.id, input);
  if (input.feedback_opt_in !== undefined) {
    // Data-sharing consent is privacy-relevant: keep a durable record of every change of mind.
    await recordAuditEvent(
      { event: 'account.data_sharing_updated', actorUserId: user.id, target: { type: 'account', id: user.id }, requestId, metadata: { feedback_opt_in: profile.feedback_opt_in } },
      log,
    );
  }
  return Response.json(profile);
});

/** DELETE /api/account — GDPR erasure: Storage first, then the auth user (cascades) (13 §5.3). */
export const DELETE = withApiHandler(async (req, { requestId, log }) => {
  const { user, supabase } = await requireUser();
  await parseBody(req, DeleteAccountSchema);
  await deleteAccount(user.id, log.child({ user_id: user.id }));
  // After the erasure succeeded; the row keeps only the (now orphaned) user id — see auditLog.ts.
  await recordAuditEvent({ event: 'account.deleted', actorUserId: user.id, target: { type: 'account', id: user.id }, requestId }, log);
  await supabase.auth.signOut().catch(() => undefined); // clears the session cookies; the user is already gone
  return new Response(null, { status: 204 });
});
