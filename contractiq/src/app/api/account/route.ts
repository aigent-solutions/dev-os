import { parseBody } from '@/lib/api/parse';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { DeleteAccountSchema, UpdateProfileSchema } from '@/lib/validation/account';
import { deleteAccount, updateProfile } from '@/server/services/account.service';

export const runtime = 'nodejs';

/** PATCH /api/account — name, data-sharing consent, onboarding flag (13 §5.2). Unknown keys → 400. */
export const PATCH = withApiHandler(async (req) => {
  const { user, supabase } = await requireUser();
  const input = await parseBody(req, UpdateProfileSchema);
  return Response.json(await updateProfile(supabase, user.id, input));
});

/** DELETE /api/account — GDPR erasure: Storage first, then the auth user (cascades) (13 §5.3). */
export const DELETE = withApiHandler(async (req, { log }) => {
  const { user, supabase } = await requireUser();
  await parseBody(req, DeleteAccountSchema);
  await deleteAccount(user.id, log.child({ user_id: user.id }));
  await supabase.auth.signOut().catch(() => undefined); // clears the session cookies; the user is already gone
  return new Response(null, { status: 204 });
});
