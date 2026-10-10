// Background Function (the -background suffix): Netlify returns 202 immediately and runs this for up
// to 15 minutes (05 §6.8). Relative imports keep bundling independent of tsconfig path aliases;
// every module on this path uses server-guard, not the `server-only` package (00 §6.12).
import { z } from 'zod';
import { assertInternalRequest } from '../../src/lib/api/internal-auth';
import { logger } from '../../src/lib/logger';
import { runExtraction } from '../../src/server/services/extraction.service';

const Payload = z.object({
  contract_id: z.string().uuid(),
  user_id: z.string().uuid(),
  request_id: z.string().max(64),
});

export default async (req: Request): Promise<Response> => {
  try {
    assertInternalRequest(req);
  } catch {
    return new Response(null, { status: 401 });
  }
  const parsed = Payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { contract_id, user_id, request_id } = parsed.data;
  const log = logger.child({ request_id, contract_id, user_id, fn: 'process-contract-background' });
  await runExtraction(contract_id, user_id, { requestId: request_id, log }); // never throws
  return new Response(null, { status: 204 });
};
