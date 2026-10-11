import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSmoke, runOpenAISmoke, SMOKE_QUESTION } from '../../../evals/lib/smoke';
import { createLogger } from '@/lib/logger';
import { UNSUPPORTED_MAX_TOKENS } from '../../mocks/openai-handlers';
import { server } from '../../setup/msw';

// The real-API smoke test's logic, against MSW (no spend): it passes on good answers and fails loudly, with
// OpenAI's diagnosis, when a model rejects our request — the gpt-6-luna incident.
const URL = 'https://api.openai.com/v1/chat/completions';
const EXTRACTION = JSON.stringify({
  detected_contract_type: 'nda',
  terms: [{ term_key: 'governing_law', value: 'England and Wales', page_number: 2, confidence: 0.95, source_sentence: 'This Agreement is governed by the laws of England and Wales.' }],
});
type Reply = (body: Record<string, unknown>) => Response;
const json: Reply = () =>
  HttpResponse.json({
    id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: EXTRACTION, refusal: null } }],
    usage: { prompt_tokens: 900, completion_tokens: 80, total_tokens: 980 },
  });
const stream: Reply = () => {
  const enc = new TextEncoder();
  const base = { id: 'c', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o' };
  const line = (p: unknown) => enc.encode(`data: ${JSON.stringify(p)}\n\n`);
  return new HttpResponse(
    new ReadableStream({
      start(c) {
        c.enqueue(line({ ...base, choices: [{ index: 0, delta: { content: 'English law governs it (Page 2).' } }] }));
        c.enqueue(line({ ...base, choices: [], usage: { prompt_tokens: 500, completion_tokens: 12, total_tokens: 512 } }));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};
const rejected: Reply = () => HttpResponse.json({ error: UNSUPPORTED_MAX_TOKENS }, { status: 400 });

/** Routes the extraction call (JSON) and the chat call (stream: true) to separate replies; records bodies. */
function openai(extraction: Reply, chat: Reply) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(URL, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return body.stream ? chat(body) : extraction(body);
    }),
  );
  return bodies;
}
const run = () => runOpenAISmoke({ log: createLogger({ test: true }) });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runOpenAISmoke', () => {
  it('both calls answer → both PASS; uses the configured models and the real request builders', async () => {
    const bodies = openai(json, stream);
    const checks = await run();
    expect(checks.map((c) => [c.name, c.ok, c.model])).toEqual([
      ['extraction', true, 'gpt-4o'],
      ['chat', true, 'gpt-4o'],
    ]);
    // The production request shape: extraction sends the strict JSON schema, chat streams the real question.
    expect(bodies[0]).toMatchObject({ model: 'gpt-4o', response_format: { type: 'json_schema' } });
    expect(bodies[1]).toMatchObject({ model: 'gpt-4o', stream: true });
    expect(JSON.stringify(bodies[1]!.messages)).toContain(SMOKE_QUESTION);
  });

  it('extraction rejected (400 unsupported_parameter) → extraction FAILs with OpenAI’s code, param and message', async () => {
    openai(rejected, stream);
    const [extraction, chat] = await run();
    expect(extraction).toMatchObject({
      ok: false,
      detail: 'OPENAI_REQUEST_REJECTED',
      upstream: { status: 400, openai_code: 'unsupported_parameter', openai_param: 'max_tokens', openai_message: UNSUPPORTED_MAX_TOKENS.message },
    });
    expect(chat!.ok).toBe(true);
  });

  it('chat rejected (400) → chat FAILs with OpenAI’s diagnosis', async () => {
    openai(json, rejected);
    const [, chat] = await run();
    expect(chat).toMatchObject({ ok: false, detail: 'UPSTREAM_REJECTED', upstream: { openai_param: 'max_tokens' } });
  });

  it('an empty extraction (no terms) is a FAIL, not a pass', async () => {
    openai(
      () =>
        HttpResponse.json({
          id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ detected_contract_type: 'nda', terms: [] }), refusal: null } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      stream,
    );
    expect((await run())[0]!.ok).toBe(false);
  });
});

describe('formatSmoke', () => {
  it('prints PASS/FAIL per check, with OpenAI’s diagnosis under a failure', async () => {
    openai(rejected, stream);
    const out = formatSmoke(await run());
    expect(out).toMatch(/^FAIL {2}extraction model=gpt-4o .*OPENAI_REQUEST_REJECTED/m);
    expect(out).toContain('OpenAI 400: code=unsupported_parameter param=max_tokens');
    expect(out).toContain(UNSUPPORTED_MAX_TOKENS.message);
    expect(out).toMatch(/^PASS {2}chat/m);
  });
});
