import { IdParamsSchema, parseParamsOr404 } from '@/lib/api/parse';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { getContractStatus } from '@/server/services/contracts.service';

export const runtime = 'nodejs';

/** GET /api/contracts/{id}/status — polled every 2 s; applies the lazy 120 s timeout (05 §5.2). */
export const GET = withApiHandler<{ id: string }>(async (_req, { params, log }) => {
  const { supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const status = await getContractStatus(supabase, id, log.child({ contract_id: id }));
  return Response.json(status, { status: 200 });
});
