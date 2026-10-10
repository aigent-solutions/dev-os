import { IdParamsSchema, parseParamsOr404 } from '@/lib/api/parse';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { extractContractText } from '@/server/services/contracts.service';

export const runtime = 'nodejs';
export const maxDuration = 26; // Netlify synchronous limit; budget is download ≤ 4 s + parse ≤ 6 s

/** POST /api/contracts/{id}/extract — server-side text extraction, once (03 §5.2). */
export const POST = withApiHandler<{ id: string }>(async (_req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const result = await extractContractText(supabase, user, id, log.child({ contract_id: id }));
  return Response.json(result, { status: 200 });
});
