import { appError } from '@/lib/api/errors';
import { IdParamsSchema, parseBody, parseParams } from '@/lib/api/parse';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/api/require-user';
import { createSseResponse } from '@/lib/api/sse';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { ChatRequestSchema } from '@/lib/validation/chat';
import { getChatHistory, streamChatAnswer } from '@/server/services/chat.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26; // the whole stream must finish inside Netlify's synchronous limit (09 §6.12)

/** GET /api/contracts/{id}/chat — history for any status (09 §5.1). */
export const GET = withApiHandler<{ id: string }>(async (_req, { params }) => {
  const { supabase } = await requireUser();
  const { id } = parseParams(params, IdParamsSchema);
  const { data: contract } = await supabase.from('contracts').select('id').eq('id', id).maybeSingle();
  if (!contract) throw appError('NOT_FOUND');
  return Response.json(await getChatHistory(supabase, id));
});

/** POST /api/contracts/{id}/chat — streamed answer over SSE (09 §5.2). Limits are checked before the stream opens. */
export const POST = withApiHandler<{ id: string }>(async (req, { params, log }) => {
  const { user, supabase } = await requireUser();
  const { id } = parseParams(params, IdParamsSchema);
  const { message } = await parseBody(req, ChatRequestSchema);
  await enforceRateLimit(user.id, 'chat');
  await enforceRateLimit(user.id, 'chat_daily');

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, status, page_count, contract_type, contract_text')
    .eq('id', id)
    .maybeSingle();
  if (!contract) throw appError('NOT_FOUND');
  if (contract.status !== 'completed' || !contract.contract_text) throw appError('CONTRACT_NOT_READY');
  const verified = { id: contract.id, page_count: contract.page_count, contract_type: contract.contract_type, contract_text: contract.contract_text };

  return createSseResponse((send, signal) =>
    streamChatAnswer({
      supabase,
      user,
      contract: verified,
      message,
      send,
      signal: AbortSignal.any([signal, req.signal]), // stream cancel or request abort = the user left
      log: log.child({ contract_id: id }),
    }),
  );
});
