import 'server-only';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import { logger, serializeError, type Logger } from '@/lib/logger';
import { assertSameOriginWrite } from '@/lib/security/requestGuard';
import { AppError, toErrorResponse } from './errors';

export type ApiContext<P> = { params: P; requestId: string; log: Logger };

// Wraps every route handler (00-foundation.md §6.6): request id, same-origin writes, error mapping, no-store,
// latency log.
export function withApiHandler<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: ApiContext<P>) => Promise<Response>,
): (req: NextRequest, ctx: { params: P }) => Promise<Response> {
  return async (req, ctx) => {
    const requestId = 'req_' + nanoid(12);
    const log = logger.child({ request_id: requestId, method: req.method, path: new URL(req.url).pathname });
    const started = performance.now();
    let res: Response;
    try {
      assertSameOriginWrite(req, log); // CSRF defence in depth, before any auth or business logic
      res = await handler(req, { params: ctx.params, requestId, log });
    } catch (err) {
      if (!(err instanceof AppError) || err.status >= 500) log.error('request_failed', { err: serializeError(err) });
      res = toErrorResponse(err, requestId);
    }
    res.headers.set('x-request-id', requestId);
    // SSE responses keep their own Cache-Control.
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) res.headers.set('Cache-Control', 'no-store');
    log.info('request_completed', { status: res.status, latency_ms: Math.round(performance.now() - started) });
    return res;
  };
}
