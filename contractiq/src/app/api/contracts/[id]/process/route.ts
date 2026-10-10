import { IdParamsSchema, parseBody, parseParamsOr404 } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { ProcessContractBodySchema } from '@/lib/validation/contract';
import { startProcessing } from '@/server/services/extraction.service';

export const runtime = 'nodejs';
export const maxDuration = 26; // sync mode needs the Netlify function timeout raised to 26 s (engineering-doc §6.6)

/** POST /api/contracts/{id}/process — 202 (background) or 200 (sync / fallback) (05 §5.1). */
export const POST = withApiHandler<{ id: string }>(async (req, { params, requestId, log }) => {
  const requestStartedAt = Date.now(); // the sync budget counts from here
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const body = await parseBody(req, ProcessContractBodySchema);
  await enforceRateLimit(user.id, 'process');
  const result = await startProcessing({
    supabase,
    user,
    contractId: id,
    customTerms: body.custom_terms,
    requestId,
    requestStartedAt,
    log: log.child({ contract_id: id }),
  });
  return Response.json(result.body, { status: result.httpStatus });
});
