import { IdParamsSchema, parseBody, parseParamsOr404 } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { KeyTermUpdateSchema } from '@/lib/validation/key-term';
import { updateKeyTerm } from '@/server/services/key-terms.service';

export const runtime = 'nodejs';

/** PATCH /api/key-terms/{id} — inline correction (08 §5). Never logs the value. */
export const PATCH = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const input = await parseBody(req, KeyTermUpdateSchema);
  await enforceRateLimit(user.id, 'edit'); // after validation: invalid requests use no quota (12 §5)
  const updated = await updateKeyTerm(supabase, id, input);
  log.info('key_term_updated', { user_id: user.id, key_term_id: id, page_changed: input.page_number !== undefined });
  return Response.json(updated);
});
