import path from 'node:path';
import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { closeDb, count, sql } from '../helpers/db';
import { CONTRACT_TEXT, createTestUser, deleteTestUser, seedContract } from '../helpers/factories';
import { adminClient, callRoute, signedInClient } from '../helpers/supabase';
import { openAiError } from '../mocks/openai-handlers';
import { server } from '../setup/msw';
import type { SeededUser } from '../setup/seed-users';

// 05-key-term-extraction.md §12 (and 12 §12 usage rows) — POST /process end to end against the local stack,
// with OpenAI and the Netlify dispatch endpoint mocked through MSW.
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const DISPATCH = 'http://localhost:3000/.netlify/functions/process-contract-background';
const GOV = 'This Agreement is governed by the laws of England and Wales.';

/** A valid NDA extraction for CONTRACT_TEXT: governing law verified on page 2, everything else not found. */
const EXTRACTION = JSON.stringify({
  detected_contract_type: 'nda',
  terms: TERM_LIBRARY.nda.map((t) =>
    t.key === 'governing_law'
      ? { term_key: t.key, value: 'England and Wales', page_number: 2, confidence: 0.95, source_sentence: GOV }
      : { term_key: t.key, value: null, page_number: null, confidence: 0.1, source_sentence: null },
  ),
});
const completion = (content: string) =>
  HttpResponse.json({
    id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, refusal: null } }],
    usage: { prompt_tokens: 6000, completion_tokens: 800, total_tokens: 6800 },
  });

/** OpenAI answers `contents` in order (the last repeats). Returns a request counter. */
function openai(...contents: string[]) {
  const calls = { n: 0 };
  server.use(http.post(OPENAI, () => completion(contents[Math.min(calls.n++, contents.length - 1)]!)));
  return calls;
}
function dispatch(respond: () => Response | Promise<Response>) {
  const calls = { n: 0, bodies: [] as unknown[] };
  server.use(
    http.post(DISPATCH, async ({ request }) => {
      calls.n++;
      calls.bodies.push(await request.json());
      return respond();
    }),
  );
  return calls;
}

/** Route + background function + status route, loaded fresh so env changes (PROCESSING_MODE …) apply. */
async function app(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('PROCESSING_MODE', 'background');
  vi.stubEnv('PROCESSING_SYNC_FALLBACK', 'true');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const processRoute = await import('@/app/api/contracts/[id]/process/route');
  const statusRoute = await import('@/app/api/contracts/[id]/status/route');
  // The Netlify function is a .mts file; a path variable keeps tsc from requiring allowImportingTsExtensions.
  const fnPath = path.join(__dirname, '../../netlify/functions/process-contract-background.mts');
  const background = ((await import(/* @vite-ignore */ fnPath)) as { default: (req: Request) => Promise<Response> }).default;
  const SECRET = process.env.INTERNAL_FUNCTION_SECRET!;
  return {
    process: (user: SeededUser, id: string, body: unknown = { custom_terms: [] }) =>
      callRoute(processRoute.POST, { method: 'POST', path: `/api/contracts/${id}/process`, params: { id }, body, user }),
    status: (user: SeededUser, id: string) => callRoute(statusRoute.GET, { path: `/api/contracts/${id}/status`, params: { id }, user }),
    runBackground: (payload: unknown, secret: string | null = SECRET) =>
      background(new Request(DISPATCH, { method: 'POST', headers: secret === null ? {} : { 'x-internal-secret': secret }, body: JSON.stringify(payload) })),
  };
}

const row = async (id: string) =>
  (await sql<{ status: string; processing_attempts: number; processing_started_at: Date | null; error_code: string | null; processing_stage: string | null }>(
    'select status, processing_attempts, processing_started_at, error_code, processing_stage from public.contracts where id = $1',
    [id],
  ))[0]!;
const usageRows = (id: string) => sql<{ operation: string; success: boolean; error_code: string | null; prompt_tokens: number; cost_usd: string; attempts: number }>(
  'select operation, success, error_code, prompt_tokens, cost_usd, attempts from public.ai_usage_logs where contract_id = $1 order by id', [id],
);

const created: string[] = [];
async function readyContract(over = {}) {
  const user = await createTestUser();
  created.push(user.id);
  const c = await seedContract(user.id, { status: 'ready', processing_attempts: 0, ...over });
  return { user, id: c.id };
}
const warnLines = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  server.resetHandlers();
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('background mode', () => {
  it('dispatch 202 → route 202 processing; the background function completes it and logs usage', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    openai(EXTRACTION);

    const res = await process(user, id, { custom_terms: ['Audit rights'] });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ contract_id: id, status: 'processing', mode: 'background' });
    expect(await row(id)).toMatchObject({ status: 'processing', processing_attempts: 1, processing_stage: 'analysing' });
    expect(d.n).toBe(1);
    expect(d.bodies[0]).toMatchObject({ contract_id: id, user_id: user.id });

    expect((await runBackground(d.bodies[0])).status).toBe(204);
    expect(await row(id)).toMatchObject({ status: 'completed', error_code: null });
    expect(await count('select count(*) from public.key_terms where contract_id = $1', [id])).toBe(TERM_LIBRARY.nda.length + 1);
    const [gov] = await sql<{ value: string; page_number: number; source_verified: boolean }>(
      "select value, page_number, source_verified from public.key_terms where contract_id = $1 and term_key = 'governing_law'", [id],
    );
    expect(gov).toEqual({ value: 'England and Wales', page_number: 2, source_verified: true });
    expect(await usageRows(id)).toEqual([{ operation: 'extraction', success: true, error_code: null, prompt_tokens: 6000, cost_usd: '0.023000', attempts: 1 }]);
  });

  it('the background function rejects a bad or missing secret with 401 and changes nothing', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    dispatch(() => new HttpResponse(null, { status: 202 }));
    await process(user, id);
    const before = await row(id);
    for (const secret of [null, 'wrong-secret-wrong-secret-wrong-secret!!']) {
      expect((await runBackground({ contract_id: id, user_id: user.id, request_id: 'r' }, secret)).status).toBe(401);
    }
    expect(await row(id)).toEqual(before);
  });

  it('OpenAI 503 × 3 → error OPENAI_UNAVAILABLE; retrying /process from error completes without re-upload', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    server.use(openAiError(503));
    await process(user, id);
    await runBackground(d.bodies[0]);
    expect(await row(id)).toMatchObject({ status: 'error', error_code: 'OPENAI_UNAVAILABLE', processing_attempts: 1 });
    expect(await usageRows(id)).toEqual([expect.objectContaining({ operation: 'extraction', success: false, error_code: 'OPENAI_UNAVAILABLE', attempts: 3 })]);

    openai(EXTRACTION);
    expect((await process(user, id)).status).toBe(202);
    await runBackground(d.bodies[1]);
    expect(await row(id)).toMatchObject({ status: 'completed', processing_attempts: 2 });
  }, 30_000);

  it('invalid JSON twice → INVALID_AI_OUTPUT', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    openai('not json', 'still not json');
    await process(user, id);
    await runBackground(d.bodies[0]);
    expect(await row(id)).toMatchObject({ status: 'error', error_code: 'INVALID_AI_OUTPUT' });
  });

  it('invalid JSON then a valid repair → completed, with an extraction_repair usage row', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    openai('{"broken', EXTRACTION);
    await process(user, id);
    await runBackground(d.bodies[0]);
    expect((await row(id)).status).toBe('completed');
    expect((await usageRows(id)).map((u) => u.operation)).toEqual(['extraction', 'extraction_repair']);
  });

  it('a second background invocation for a finished contract is a no-op', async () => {
    const { process, runBackground } = await app();
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    const calls = openai(EXTRACTION);
    await process(user, id);
    await runBackground(d.bodies[0]);
    await runBackground(d.bodies[0]);
    expect(calls.n).toBe(1);
    expect(await usageRows(id)).toHaveLength(1);
  });
});

describe('guards', () => {
  it('two concurrent POSTs → one 202, one 409 ALREADY_PROCESSING; attempts incremented once', async () => {
    const { process } = await app();
    const { user, id } = await readyContract();
    dispatch(() => new HttpResponse(null, { status: 202 }));
    const statuses = (await Promise.all([process(user, id), process(user, id)])).map((r) => r.status).sort();
    expect(statuses).toEqual([202, 409]);
    expect((await row(id)).processing_attempts).toBe(1);
  });

  it.each([
    ['processing_attempts = 5', { status: 'error', processing_attempts: 5 }, 'MAX_ATTEMPTS'],
    ['status completed', { status: 'completed' }, 'INVALID_STATUS'],
  ])('%s → 409 %s', async (_l, over, code) => {
    const { process } = await app();
    const { user, id } = await readyContract(over);
    const res = await process(user, id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
  });

  it("another user's contract → 404", async () => {
    const { process } = await app();
    const { id } = await readyContract();
    const other = await createTestUser();
    created.push(other.id);
    expect((await process(other, id)).status).toBe(404);
  });

  it('the user client cannot change status (server-managed column → 42501)', async () => {
    const { user, id } = await readyContract();
    const { error } = await (await signedInClient(user)).from('contracts').update({ status: 'completed' } as never).eq('id', id);
    expect(error?.code).toBe('42501');
  });
});

describe('sync mode and fallback', () => {
  it('PROCESSING_MODE=sync → 200 completed, and dispatch is never called', async () => {
    const { process } = await app({ PROCESSING_MODE: 'sync' });
    const { user, id } = await readyContract();
    const d = dispatch(() => new HttpResponse(null, { status: 202 }));
    openai(EXTRACTION);
    const res = await process(user, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'completed', mode: 'sync', error: null });
    expect(d.n).toBe(0);
    expect((await row(id)).status).toBe('completed');
  });

  it.each([
    ['404', () => new HttpResponse(null, { status: 404 })],
    ['a network error', () => HttpResponse.error()],
    ['no answer within 3 s', async () => {
      await delay(3_500);
      return new HttpResponse(null, { status: 202 });
    }],
  ])('dispatch fails with %s + fallback on → 200 completed via sync, logs PROCESSING_FALLBACK_SYNC', async (_l, respond) => {
    const { process } = await app();
    const { user, id } = await readyContract();
    dispatch(respond);
    openai(EXTRACTION);
    const res = await process(user, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'completed', mode: 'sync' });
    expect(warnLines().some((l) => l.includes('PROCESSING_FALLBACK_SYNC'))).toBe(true);
  }, 15_000);

  it('dispatch fails + fallback off → 502 JOB_DISPATCH_FAILED and the claim is rolled back', async () => {
    const { process } = await app({ PROCESSING_SYNC_FALLBACK: 'false' });
    const { user, id } = await readyContract({ status: 'error', processing_attempts: 2 });
    await adminClient().from('contracts').update({ error_code: 'OPENAI_UNAVAILABLE' }).eq('id', id);
    const before = await row(id);
    dispatch(() => new HttpResponse(null, { status: 500 }));
    const res = await process(user, id);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('JOB_DISPATCH_FAILED');
    expect(await row(id)).toEqual(before);
  });

  it('OpenAI slower than the sync budget → 200 { status: error, SYNC_BUDGET_EXCEEDED }, row error', async () => {
    const { process } = await app({ PROCESSING_MODE: 'sync', SYNC_PROCESSING_BUDGET_MS: '5000' });
    const { user, id } = await readyContract();
    server.use(
      http.post(OPENAI, async () => {
        await delay(15_000);
        return completion(EXTRACTION);
      }),
    );
    const res = await process(user, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'error', mode: 'sync', error: { code: 'SYNC_BUDGET_EXCEEDED' } });
    expect(await row(id)).toMatchObject({ status: 'error', error_code: 'SYNC_BUDGET_EXCEEDED' });
  }, 20_000);
});

describe('lazy timeout', () => {
  it('processing for 3 min → GET /status returns error PROCESSING_TIMEOUT; a late save is refused with P0002', async () => {
    const { process, status } = await app();
    const { user, id } = await readyContract();
    dispatch(() => new HttpResponse(null, { status: 202 }));
    await process(user, id);
    await sql(`update public.contracts set processing_started_at = now() - interval '3 minutes' where id = $1`, [id]);

    const res = await status(user, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'error', error: { code: 'PROCESSING_TIMEOUT' } });

    const { error } = await adminClient().rpc('save_extraction_results', {
      p_contract_id: id, p_user_id: user.id, p_detected_type: 'nda', p_type_mismatch: false, p_prompt_version: 'extraction-v1.0', p_terms: [],
    });
    expect(error?.code).toBe('P0002');
  });
});

it('CONTRACT_TEXT fixture contains the governing-law sentence (sanity)', () => {
  expect(CONTRACT_TEXT).toContain(GOV);
});
