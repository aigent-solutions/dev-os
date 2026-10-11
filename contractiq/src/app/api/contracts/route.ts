import { appError } from '@/lib/api/errors';
import { parseBody, parseQuery } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { recordAuditEvent } from '@/lib/security/auditLog';
import { MAX_FILE_BYTES } from '@/lib/constants';
import { CreateContractSchema, ListContractsQuerySchema } from '@/lib/validation/contract';
import { createContract, listContracts } from '@/server/services/contracts.service';

export const runtime = 'nodejs';

/** POST /api/contracts — create the pending_upload record the browser uploads against (03 §5.1). */
export const POST = withApiHandler(async (req, { requestId, log }) => {
  const { user, supabase } = await requireUser();
  const body = await parseBody(req, CreateContractSchema);
  if (body.file_size > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  await enforceRateLimit(user.id, 'upload');
  const result = await createContract(supabase, user, body);
  await recordAuditEvent(
    {
      event: 'contract.uploaded',
      actorUserId: user.id,
      target: { type: 'contract', id: result.contract_id },
      requestId,
      metadata: { contract_type: body.contract_type, file_size: body.file_size }, // never the file name
    },
    log,
  );
  return Response.json(result, { status: 201 });
});

/** GET /api/contracts — sorted, filtered, paginated history with low-confidence counts (10 §5.2). */
export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireUser();
  const q = parseQuery(req, ListContractsQuerySchema);
  return Response.json(await listContracts(supabase, q));
});
