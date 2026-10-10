import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../setup/msw';

// Our own timeouts must be retried (00 §6.8, 05 §6.3, 09 §10); a user's Stop must not. The OpenAI SDK reports
// both as APIUserAbortError, so these guard the TimeoutError surfacing in withRetry and streamChatCompletion.
// OPENAI_TIMEOUT_MS (20 s) is shrunk to 300 ms.
vi.mock('@/lib/constants', async (orig) => ({ ...(await orig<typeof import('@/lib/constants')>()), OPENAI_TIMEOUT_MS: 300 }));
const { ChatStreamError, streamChatCompletion } = await import('@/lib/ai/chat');
const { callExtractionModel } = await import('@/lib/ai/extraction');
const { buildExtractionResponseFormat } = await import('@/lib/ai/extraction-schema');
const { createLogger } = await import('@/lib/logger');

const URL = 'https://api.openai.com/v1/chat/completions';
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const drain = async (signal: AbortSignal, stats = { attempts: 0 }) => {
  for await (const chunk of streamChatCompletion({ messages: [{ role: 'user', content: 'q' }], userId: 'u', signal, stats })) void chunk; // drain
};

describe('chat', () => {
  it('no first token in time → retried 3 times, then UPSTREAM_TIMEOUT', async () => {
    const calls = { n: 0 };
    server.use(
      http.post(URL, async () => {
        calls.n++;
        await delay(5_000);
        return HttpResponse.json({});
      }),
    );
    const stats = { attempts: 0 };
    const err = await drain(new AbortController().signal, stats).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatStreamError);
    expect((err as InstanceType<typeof ChatStreamError>).code).toBe('UPSTREAM_TIMEOUT');
    expect(calls.n).toBe(3);
    expect(stats.attempts).toBe(3);
  }, 20_000);

  it("the user's Stop is never retried → CLIENT_ABORTED after one request", async () => {
    const calls = { n: 0 };
    server.use(
      http.post(URL, async () => {
        calls.n++;
        await delay(5_000);
        return HttpResponse.json({});
      }),
    );
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 100);
    const err = await drain(stop.signal).catch((e: unknown) => e);
    expect((err as InstanceType<typeof ChatStreamError>).code).toBe('CLIENT_ABORTED');
    expect(calls.n).toBe(1);
  });
});

describe('extraction (background)', () => {
  it('a hung request is retried; the second attempt succeeds', async () => {
    const calls = { n: 0 };
    const valid = JSON.stringify({ detected_contract_type: 'nda', terms: [] });
    server.use(
      http.post(URL, async () => {
        calls.n++;
        if (calls.n === 1) await delay(5_000);
        return HttpResponse.json({
          id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: valid, refusal: null } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }),
    );
    const r = await callExtractionModel({
      messages: [{ role: 'user', content: 'x' }],
      responseFormat: buildExtractionResponseFormat(['parties']),
      userId: 'u',
      log: createLogger({ test: true }),
    });
    expect(r.attempts).toBe(2);
    expect(calls.n).toBe(2);
  }, 20_000);
});
