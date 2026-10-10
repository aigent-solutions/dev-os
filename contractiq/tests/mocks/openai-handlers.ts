import { http, HttpResponse } from 'msw';

const COMPLETIONS = 'https://api.openai.com/v1/chat/completions';

/**
 * Default handlers: none. Any OpenAI call a test didn't arrange fails loudly (tests/setup/msw.ts).
 * Tests add handlers with server.use(openAiJson(...)) or server.use(openAiStream(...)).
 */
export const openAiHandlers = [];

/** Non-streamed chat completion whose message content is `content` (a JSON string for extraction). */
export function openAiJson(content: string, usage = { prompt_tokens: 1000, completion_tokens: 200 }) {
  return http.post(COMPLETIONS, () =>
    HttpResponse.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-4o',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
    }),
  );
}

/** Streamed chat completion that sends `deltas` as separate chunks, then usage and [DONE]. */
export function openAiStream(deltas: string[], usage = { prompt_tokens: 1000, completion_tokens: 50 }) {
  return http.post(COMPLETIONS, () => {
    const encoder = new TextEncoder();
    const chunk = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
    const base = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o' };
    const stream = new ReadableStream({
      start(c) {
        for (const d of deltas) c.enqueue(chunk({ ...base, choices: [{ index: 0, delta: { content: d } }] }));
        c.enqueue(chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
        c.enqueue(chunk({ ...base, choices: [], usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } }));
        c.enqueue(encoder.encode('data: [DONE]\n\n'));
        c.close();
      },
    });
    return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  });
}

/** An OpenAI API error response (e.g. 429 or 503) to exercise retries. */
export function openAiError(status: number, headers: Record<string, string> = {}) {
  return http.post(COMPLETIONS, () =>
    HttpResponse.json({ error: { message: `mock ${status}`, type: 'server_error' } }, { status, headers }),
  );
}
