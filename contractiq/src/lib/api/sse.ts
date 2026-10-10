import 'server-only';

export type SseEvent = 'meta' | 'token' | 'done' | 'error';
export type SseSend = (event: SseEvent, data: unknown) => void;

// Server-Sent Events response for streamed chat (00-foundation.md §6.6).
export function createSseResponse(run: (send: SseSend, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  let closed = false; // set on normal completion or when the client cancels
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const enqueue = (chunk: string) => {
        if (!closed) c.enqueue(encoder.encode(chunk));
      };
      const send: SseSend = (event, data) => enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const keepAlive = setInterval(() => enqueue(': keep-alive\n\n'), 15_000);
      try {
        await run(send, controller.signal);
      } finally {
        clearInterval(keepAlive);
        if (!closed) {
          closed = true;
          c.close();
        }
      }
    },
    cancel() {
      closed = true;
      controller.abort(); // client disconnected or pressed Stop
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
