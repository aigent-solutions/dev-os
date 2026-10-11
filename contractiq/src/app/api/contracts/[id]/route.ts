import { appError } from '@/lib/api/errors';
import { IdParamsSchema, parseBody, parseParams, parseParamsOr404 } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { recordAuditEvent } from '@/lib/security/auditLog';
import { ContractUpdateSchema } from '@/lib/validation/contract';
import { deleteContract, getContractDetail, updateContract } from '@/server/services/contracts.service';

export const runtime = 'nodejs';

/** GET /api/contracts/{id} — results detail (06 §5.1). Malformed id → 404. */
export const GET = withApiHandler<{ id: string }>(async (_req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const detail = await getContractDetail(supabase, user.id, id, log.child({ contract_id: id, user_id: user.id }));
  if (!detail) throw appError('NOT_FOUND');
  return Response.json(detail);
});

/** PATCH /api/contracts/{id} — review complete / undo / rename (06 §5.2). */
export const PATCH = withApiHandler<{ id: string }>(async (req, { params }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParamsOr404(params, IdParamsSchema);
  const input = await parseBody(req, ContractUpdateSchema);
  await enforceRateLimit(user.id, 'edit'); // after validation (12 §5); limited per 06 — see README §7
  return Response.json(await updateContract(supabase, id, input));
});

/** DELETE /api/contracts/{id} — any status, 204 (13 §5.1). Malformed id → 400. */
export const DELETE = withApiHandler<{ id: string }>(async (_req, { params, requestId, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParams(params, IdParamsSchema);
  await deleteContract(supabase, user.id, id, log);
  await recordAuditEvent({ event: 'contract.deleted', actorUserId: user.id, target: { type: 'contract', id }, requestId }, log);
  return new Response(null, { status: 204 });
});
