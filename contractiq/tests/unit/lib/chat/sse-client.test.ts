import { afterEach, describe, expect, it, vi } from 'vitest';
import { postChatStream, type ChatStreamHandlers } from '@/lib/chat/sse-client';

// 09-contract-chat.md §12 — the browser-side SSE parser for the POST chat stream.
afterEach(() => vi.unstubAllGlobals());

/** A fetch that answers with `chunks` as an event stream, split exactly where given. */
function streamFetch(chunks: string[]) {
  const enc = new TextEncoder();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(c) { chunks.forEach((s) => c.enqueue(enc.encode(s))); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } })));
}
function handlers() {
  const log: [string, unknown][] = [];
  const h: ChatStreamHandlers = {
    onMeta: (d) => log.push(['meta', d]),
    onToken: (d) => log.push(['token', d]),
    onDone: (d) => log.push(['done', d]),
    onError: (d) => log.push(['error', d]),
  };
  return { h, log };
}
const run = (h: ChatStreamHandlers, signal = new AbortController().signal) => postChatStream('c-1', 'q', h, signal);
const DONE = { message_id: 'm', cited_pages: [2], is_not_found: false, citation_missing: false, content: 'Hello world [Page 2]' };

describe('postChatStream', () => {
  it('parses events split across chunk boundaries (inside "\\n\\n" and mid-JSON)', async () => {
    streamFetch([
      'event: meta\ndata: {"session_id":"s","user_message_id":"u","query_type":"contract"}\n',
      '\nevent: token\ndata: {"del',
      'ta":"Hello "}\n\nevent: token\ndata: {"delta":"world"}\n\n',
      `event: done\ndata: ${JSON.stringify(DONE)}\n\n`,
    ]);
    const { h, log } = handlers();
    await run(h);
    expect(log).toEqual([
      ['meta', { session_id: 's', user_message_id: 'u', query_type: 'contract' }],
      ['token', { delta: 'Hello ' }],
      ['token', { delta: 'world' }],
      ['done', DONE],
    ]);
  });

  it('joins multi-line data: fields', async () => {
    streamFetch(['event: token\ndata: {"delta":\ndata: "x"}\n\n', `event: done\ndata: ${JSON.stringify(DONE)}\n\n`]);
    const { h, log } = handlers();
    await run(h);
    expect(log[0]).toEqual(['token', { delta: 'x' }]);
  });

  it('ignores ":" keep-alive comments', async () => {
    streamFetch([': keep-alive\n\n', 'event: token\n: interleaved comment\ndata: {"delta":"a"}\n\n', `event: done\ndata: ${JSON.stringify(DONE)}\n\n`]);
    const { h, log } = handlers();
    await run(h);
    expect(log.map((l) => l[0])).toEqual(['token', 'done']);
  });

  it('a non-200 JSON error envelope → onError (not partial)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'RATE_LIMITED', message: 'Slow down', retryable: true } }, { status: 429 })));
    const { h, log } = handlers();
    await run(h);
    expect(log).toEqual([['error', { code: 'RATE_LIMITED', message: 'Slow down', retryable: true, message_id: null, partial: false }]]);
  });

  it('a stream that ends with no terminal event → onError partial', async () => {
    streamFetch(['event: token\ndata: {"delta":"half an ans"}\n\n']);
    const { h, log } = handlers();
    await run(h);
    expect(log.at(-1)).toEqual(['error', expect.objectContaining({ code: 'INTERNAL_ERROR', partial: true })]);
  });

  it('a server error event is passed through and is terminal', async () => {
    const err = { code: 'UPSTREAM_UNAVAILABLE', message: 'x', retryable: true, message_id: 'm', partial: true };
    streamFetch([`event: error\ndata: ${JSON.stringify(err)}\n\n`]);
    const { h, log } = handlers();
    await run(h);
    expect(log).toEqual([['error', err]]);
  });

  it('Stop (abort) ends quietly, with no onError', async () => {
    const ac = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => {
      ac.abort();
      throw new DOMException('aborted', 'AbortError');
    }));
    const { h, log } = handlers();
    await run(h, ac.signal);
    expect(log).toEqual([]);
  });

  it('a network failure → onError, not partial', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { h, log } = handlers();
    await run(h);
    expect(log).toEqual([['error', expect.objectContaining({ partial: false, message: "Couldn't get an answer." })]]);
  });
});
