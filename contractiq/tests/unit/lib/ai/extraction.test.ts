import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callExtractionModel, ExtractionError } from '@/lib/ai/extraction';
import { buildExtractionResponseFormat } from '@/lib/ai/extraction-schema';
import { createLogger } from '@/lib/logger';
import { server } from '../../../setup/msw';

// 05-key-term-extraction.md §12 — retries, repair and the sync budget, with OpenAI mocked through MSW.
const URL = 'https://api.openai.com/v1/chat/completions';
const VALID = JSON.stringify({ detected_contract_type: 'nda', terms: [{ term_key: 'parties', value: 'A and B', page_number: 1, confidence: 0.9, source_sentence: null }] });
const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, refusal: null, ...extra } }],
  usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
});

/** Serves `responses` in order (the last one repeats) and counts requests. */
function sequence(...responses: (() => Response | Promise<Response>)[]) {
  const calls = { n: 0 };
  server.use(
    http.post(URL, async () => {
      const r = responses[Math.min(calls.n, responses.length - 1)]!;
      calls.n++;
      return r();
    }),
  );
  return calls;
}
const ok = (content = VALID, extra?: Record<string, unknown>) => () => HttpResponse.json(completion(content, extra));
const status = (code: number) => () => HttpResponse.json({ error: { message: `mock ${code}`, type: 'x' } }, { status: code });

const call = (deadlineAt?: number) =>
  callExtractionModel({
    messages: [{ role: 'user', content: 'x' }],
    responseFormat: buildExtractionResponseFormat(['parties']),
    userId: 'u-1',
    deadlineAt,
    log: createLogger({ test: true }),
  });
const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(ExtractionError);
  return e as ExtractionError;
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('callExtractionModel (background)', () => {
  it('success on the first attempt', async () => {
    const calls = sequence(ok());
    const r = await call();
    expect(r.attempts).toBe(1);
    expect(r.result.terms[0]!.value).toBe('A and B');
    expect(r.usage).toEqual({ promptTokens: 1000, completionTokens: 200 });
    expect(r.repairUsage).toBeUndefined();
    expect(calls.n).toBe(1);
  });

  it('503 then 200 → attempts 2', async () => {
    sequence(status(503), ok());
    expect((await call()).attempts).toBe(2);
  });

  it('3 × 503 → OPENAI_UNAVAILABLE after 3 requests', async () => {
    const calls = sequence(status(503));
    const e = await codeOf(call());
    expect(e.code).toBe('OPENAI_UNAVAILABLE');
    expect(calls.n).toBe(3);
  }, 15_000);

  it.each([401, 403, 404])('%i → OPENAI_REQUEST_REJECTED, no retry', async (code) => {
    const calls = sequence(status(code));
    expect((await codeOf(call())).code).toBe('OPENAI_REQUEST_REJECTED');
    expect(calls.n).toBe(1);
  });

  it("400 unsupported_parameter → OPENAI_REQUEST_REJECTED after 1 request; openai_request_failed carries OpenAI's diagnosis", async () => {
    const message = "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
    const calls = sequence(() =>
      HttpResponse.json({ error: { message, type: 'invalid_request_error', param: 'max_tokens', code: 'unsupported_parameter' } }, { status: 400 }),
    );
    expect((await codeOf(call())).code).toBe('OPENAI_REQUEST_REJECTED');
    expect(calls.n).toBe(1);
    const lines = vi.mocked(console.error).mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(lines.find((l) => l.msg === 'openai_request_failed')).toMatchObject({
      level: 'error',
      model: 'gpt-4o',
      status: 400,
      openai_type: 'invalid_request_error',
      openai_code: 'unsupported_parameter',
      openai_param: 'max_tokens',
      openai_message: message,
    });
  });

  it('429 is still retryable: 3 × 429 → OPENAI_UNAVAILABLE', async () => {
    const calls = sequence(status(429));
    expect((await codeOf(call())).code).toBe('OPENAI_UNAVAILABLE');
    expect(calls.n).toBe(3);
  }, 15_000);

  it('invalid JSON, then valid on the repair → repairUsage set', async () => {
    const calls = sequence(ok('{"terms": [oops'), ok());
    const r = await call();
    expect(r.repairUsage).toEqual({ promptTokens: 1000, completionTokens: 200 });
    expect(calls.n).toBe(2);
  });

  it('schema-invalid JSON counts as invalid output too', async () => {
    sequence(ok('{"detected_contract_type":"nda"}'), ok());
    expect((await call()).repairUsage).toBeDefined();
  });

  it('invalid twice → INVALID_AI_OUTPUT carrying both calls’ usage', async () => {
    const calls = sequence(ok('nope'), ok('still nope'));
    const e = await codeOf(call());
    expect(e.code).toBe('INVALID_AI_OUTPUT');
    expect(e.usage).toEqual({ promptTokens: 2000, completionTokens: 400 });
    expect(calls.n).toBe(2);
  });

  it('a refusal → INVALID_AI_OUTPUT without a repair attempt', async () => {
    const calls = sequence(ok('', { refusal: 'I cannot help with that.' }));
    expect((await codeOf(call())).code).toBe('INVALID_AI_OUTPUT');
    expect(calls.n).toBe(1);
  });

  it('finish_reason length (truncated JSON) → repaired', async () => {
    const calls = { n: 0 };
    server.use(
      http.post(URL, () => {
        calls.n++;
        const c = completion(calls.n === 1 ? '{"detected' : VALID);
        if (calls.n === 1) c.choices[0]!.finish_reason = 'length';
        return HttpResponse.json(c);
      }),
    );
    expect((await call()).repairUsage).toBeDefined();
  });
});

describe('callExtractionModel (sync budget)', () => {
  it('no retry once < 8 s would remain → SYNC_BUDGET_EXCEEDED', async () => {
    const calls = sequence(async () => {
      await delay(2000);
      return status(503)();
    });
    const e = await codeOf(call(Date.now() + 9_600));
    expect(e.code).toBe('SYNC_BUDGET_EXCEEDED');
    expect(calls.n).toBe(1);
  });

  it('the repair is skipped when < 8 s remain → SYNC_BUDGET_EXCEEDED', async () => {
    const calls = sequence(async () => {
      await delay(1500);
      return ok('not json')();
    });
    const e = await codeOf(call(Date.now() + 9_000));
    expect(e.code).toBe('SYNC_BUDGET_EXCEEDED');
    expect(calls.n).toBe(1);
  });

  it('per-attempt timeout = remaining − 1.5 s when that is under 20 s', async () => {
    sequence(async () => {
      await delay(5000);
      return ok()();
    });
    const started = Date.now();
    const e = await codeOf(call(Date.now() + 3_000)); // timeout = 3000 − 1500 = 1500 ms
    const elapsed = Date.now() - started;
    expect(e.code).toBe('SYNC_BUDGET_EXCEEDED');
    expect(elapsed).toBeGreaterThanOrEqual(1300);
    expect(elapsed).toBeLessThan(2500);
  });

  it('no budget left at all → SYNC_BUDGET_EXCEEDED with no request', async () => {
    const calls = sequence(ok());
    expect((await codeOf(call(Date.now() + 1_000))).code).toBe('SYNC_BUDGET_EXCEEDED');
    expect(calls.n).toBe(0);
  });
});
