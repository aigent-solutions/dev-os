// Real-API smoke test (run by evals/smoke-openai.ts): one minimal extraction and one chat call through the
// app's own request builders, against whatever models env configures. It exists because the mock accepts any
// parameters: gpt-6-luna rejected `max_tokens` and `temperature` in production while every test passed.
import type OpenAI from 'openai';
import { buildChatMessages, ChatStreamError, streamChatCompletion } from '@/lib/ai/chat';
import { callExtractionModel, ExtractionError } from '@/lib/ai/extraction';
import { buildExtractionResponseFormat } from '@/lib/ai/extraction-schema';
import { getExtractionPrompt } from '@/lib/ai/prompts';
import { buildRequestedTerms } from '@/lib/ai/term-library';
import { serverEnv } from '@/lib/env';
import type { Logger } from '@/lib/logger';
import type { OpenAIErrorFields } from '@/lib/retry';

/** A synthetic two-page NDA: enough for real terms and a cited answer, cheap enough to run on every release. */
export const SMOKE_CONTRACT = [
  '[PAGE 1]',
  'MUTUAL NON-DISCLOSURE AGREEMENT',
  'This Agreement is made on 1 March 2026 between Northwind Analytics Ltd and Fabrikam Robotics Inc.',
  'Each party shall keep the Confidential Information of the other party secret and use it only to evaluate a potential partnership.',
  '',
  '[PAGE 2]',
  'This Agreement continues for two (2) years. Either party may end it by giving thirty (30) days written notice.',
  'This Agreement is governed by the laws of England and Wales.',
].join('\n');
export const SMOKE_QUESTION = 'Which law governs this agreement?';
const SMOKE_USER = 'smoke-test';

export type SmokeCheck = {
  name: 'extraction' | 'chat';
  model: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  /** OpenAI's diagnosis when it rejected or failed the request. */
  upstream?: OpenAIErrorFields;
};

export async function runOpenAISmoke(opts: { client?: OpenAI; log: Logger }): Promise<SmokeCheck[]> {
  return [await smokeExtraction(opts), await smokeChat(opts)];
}

async function smokeExtraction({ client, log }: { client?: OpenAI; log: Logger }): Promise<SmokeCheck> {
  const model = serverEnv.OPENAI_EXTRACTION_MODEL;
  const started = Date.now();
  const terms = buildRequestedTerms('nda', []);
  const prompt = getExtractionPrompt(serverEnv.EXTRACTION_PROMPT_VERSION);
  try {
    const r = await callExtractionModel({
      messages: prompt.buildMessages({ contractType: 'nda', terms, contractText: SMOKE_CONTRACT }),
      responseFormat: buildExtractionResponseFormat(terms.map((t) => t.key)),
      userId: SMOKE_USER,
      log,
      client,
    });
    const found = r.result.terms.filter((t) => t.value !== null).length;
    const ok = r.result.terms.length > 0 && found > 0;
    return {
      name: 'extraction',
      model,
      ok,
      latencyMs: Date.now() - started,
      detail: `${r.result.terms.length} terms returned, ${found} with a value; ${r.usage.promptTokens} in / ${r.usage.completionTokens} out tokens`,
    };
  } catch (err) {
    const e = err instanceof ExtractionError ? err : null;
    return {
      name: 'extraction',
      model,
      ok: false,
      latencyMs: Date.now() - started,
      detail: e ? e.code : err instanceof Error ? err.message : String(err),
      upstream: e?.upstream,
    };
  }
}

async function smokeChat({ client }: { client?: OpenAI; log: Logger }): Promise<SmokeCheck> {
  const model = serverEnv.OPENAI_CHAT_MODEL;
  const started = Date.now();
  const messages = buildChatMessages({
    version: serverEnv.CHAT_PROMPT_VERSION,
    contractType: 'nda',
    contractText: SMOKE_CONTRACT,
    queryType: 'contract',
    history: [],
    question: SMOKE_QUESTION,
    maxInputTokens: serverEnv.CHAT_MAX_INPUT_TOKENS,
  });
  let text = '';
  let usage = { promptTokens: 0, completionTokens: 0 };
  try {
    for await (const chunk of streamChatCompletion({ messages, userId: SMOKE_USER, signal: new AbortController().signal, client })) {
      if (chunk.type === 'delta') text += chunk.text;
      else usage = chunk.usage;
    }
    const ok = text.trim().length > 0;
    return {
      name: 'chat',
      model,
      ok,
      latencyMs: Date.now() - started,
      detail: ok ? `answered (${text.trim().length} chars); ${usage.promptTokens} in / ${usage.completionTokens} out tokens` : 'empty answer',
    };
  } catch (err) {
    const e = err instanceof ChatStreamError ? err : null;
    return {
      name: 'chat',
      model,
      ok: false,
      latencyMs: Date.now() - started,
      detail: e ? e.code : err instanceof Error ? err.message : String(err),
      upstream: e?.upstream,
    };
  }
}

/** One line per check; failures add OpenAI's own diagnosis so the cause is readable at a glance. */
export function formatSmoke(checks: SmokeCheck[]): string {
  return checks
    .map((c) => {
      const head = `${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(10)} model=${c.model}  ${c.latencyMs} ms  ${c.detail}`;
      const u = c.upstream;
      return u ? `${head}\n      OpenAI ${u.status}: code=${u.openai_code} param=${u.openai_param}\n      ${u.openai_message}` : head;
    })
    .join('\n');
}
