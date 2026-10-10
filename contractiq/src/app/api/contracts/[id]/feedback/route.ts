import { IdParamsSchema, parseBody, parseParamsOr404 } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { FeedbackSchema } from '@/lib/validation/feedback';
import { upsertFeedback } from '@/server/services/feedback.service';

export const runtime = 'nodejs';

/** PUT /api/contracts/{id}/feedback — upsert rating, comment, accuracy (11 §5, §6.1). Comment text is never logged. */
export const PUT = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const input = await parseBody(req, FeedbackSchema);
  await enforceRateLimit(user.id, 'feedback'); // after validation: invalid requests use no quota (12 §5)
  const saved = await upsertFeedback(supabase, user.id, id, input);
  log.info('feedback_saved', { user_id: user.id, contract_id: id, rating: saved.rating, has_comment: saved.comment !== null });
  return Response.json(saved);
});
