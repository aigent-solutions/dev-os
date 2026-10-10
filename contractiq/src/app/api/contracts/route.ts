import { appError } from '@/lib/api/errors';
import { parseBody, parseQuery } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { MAX_FILE_BYTES } from '@/lib/constants';
import { CreateContractSchema, ListContractsQuerySchema } from '@/lib/validation/contract';
import { createContract, listContracts } from '@/server/services/contracts.service';

export const runtime = 'nodejs';

/** POST /api/contracts — create the pending_upload record the browser uploads against (03 §5.1). */
export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireUser();
  const body = await parseBody(req, CreateContractSchema);
  if (body.file_size > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  await enforceRateLimit(user.id, 'upload');
  const result = await createContract(supabase, user, body);
  return Response.json(result, { status: 201 });
});

/** GET /api/contracts — sorted, filtered, paginated history with low-confidence counts (10 §5.2). */
export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireUser();
  const q = parseQuery(req, ListContractsQuerySchema);
  return Response.json(await listContracts(supabase, q));
});
