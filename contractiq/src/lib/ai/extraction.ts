import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { OPENAI_TIMEOUT_MS } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import type { Logger } from '@/lib/logger';
import { BACKGROUND_RETRY, isOpenAIRequestRejection, isRetryableOpenAIError, openAIErrorFields, withRetry, type OpenAIErrorFields, type RetryOptions } from '@/lib/retry';
import { ExtractionResultSchema, type ExtractionResponseFormat, type ExtractionResult } from './extraction-schema';
import { getOpenAI, hashUserId } from './openai-client';

// One extraction call with per-mode retries and a single JSON repair retry (05 §6.3).
export type Usage = { promptTokens: number; completionTokens: number };
// OPENAI_REQUEST_REJECTED: OpenAI refused the request itself (4xx, not 429); a retry can't succeed.
export type ExtractionErrorCode = 'OPENAI_UNAVAILABLE' | 'OPENAI_REQUEST_REJECTED' | 'INVALID_AI_OUTPUT' | 'SYNC_BUDGET_EXCEEDED';

export class ExtractionError extends Error {
  constructor(
    public code: ExtractionErrorCode,
    public attempts = 1,
    public usage?: Usage,
    /** OpenAI's own diagnosis when it returned an error (also logged as openai_request_failed). */
    public upstream?: OpenAIErrorFields,
  ) {
    super(code);
    this.name = 'ExtractionError';
  }
}

export const REPAIR_PROMPT =
  'Your previous response was not valid JSON matching the schema. Return only the JSON object, no explanation.';

const SYNC_RESERVE_MS = 1_500; // kept back for saving results and responding
const SYNC_MIN_FOR_RETRY_MS = 8_000;

const toUsage = (c: ChatCompletion): Usage => ({
  promptTokens: c.usage?.prompt_tokens ?? 0,
  completionTokens: c.usage?.completion_tokens ?? 0,
});

function retryOptions(deadlineAt: number | undefined, attempts: number): RetryOptions {
  if (deadlineAt === undefined) return { ...BACKGROUND_RETRY, attempts };
  return {
    attempts,
    baseDelayMs: 500,
    factor: 1,
    jitter: false,
    deadlineAt,
    minRemainingMsForRetry: SYNC_MIN_FOR_RETRY_MS,
    perAttemptTimeoutMs: (remaining) => Math.min(OPENAI_TIMEOUT_MS, remaining - SYNC_RESERVE_MS),
    isRetryable: isRetryableOpenAIError,
  };
}

type ParseOutcome = { ok: true; result: ExtractionResult } | { ok: false; refusal: boolean; content: string };

function parseCompletion(c: ChatCompletion): ParseOutcome {
  const choice = c.choices[0];
  const content = choice?.message.content ?? '';
  if (choice?.message.refusal) return { ok: false, refusal: true, content };
  if (!choice || choice.finish_reason === 'length') return { ok: false, refusal: false, content };
  try {
    const parsed = ExtractionResultSchema.safeParse(JSON.parse(content));
    return parsed.success ? { ok: true, result: parsed.data } : { ok: false, refusal: false, content };
  } catch {
    return { ok: false, refusal: false, content };
  }
}

export async function callExtractionModel(p: {
  messages: ChatCompletionMessageParam[];
  responseFormat: ExtractionResponseFormat;
  userId: string;
  deadlineAt?: number;
  log: Logger;
  client?: OpenAI; // default getOpenAI(); evals inject a replay client (15 §6.2)
}): Promise<{ result: ExtractionResult; usage: Usage; repairUsage?: Usage; attempts: number; latencyMs: number; model: string }> {
  const client = p.client ?? getOpenAI();
  const model = serverEnv.OPENAI_EXTRACTION_MODEL;
  const sync = p.deadlineAt !== undefined;
  const remaining = () => (p.deadlineAt ?? Infinity) - Date.now();
  const started = Date.now();
  let attemptsUsed = 0;

  const request = (messages: ChatCompletionMessageParam[], maxAttempts: number) =>
    withRetry(
      (attempt, signal) => {
        attemptsUsed = Math.max(attemptsUsed, attempt);
        return client.chat.completions.create(
          {
            model,
            messages,
            temperature: 0.1,
            max_tokens: 2000,
            response_format: p.responseFormat,
            user: hashUserId(p.userId),
            store: false,
          },
          { signal },
        );
      },
      retryOptions(p.deadlineAt, maxAttempts),
    );

  /** Maps a transport failure to a contract error code. */
  const classify = (err: unknown): ExtractionError => {
    if (sync && isRetryableOpenAIError(err) && remaining() < SYNC_MIN_FOR_RETRY_MS) {
      return new ExtractionError('SYNC_BUDGET_EXCEEDED', Math.max(1, attemptsUsed));
    }
    const upstream = err instanceof OpenAI.APIError ? openAIErrorFields(err) : undefined;
    if (upstream) p.log.error('openai_request_failed', { model, ...upstream });
    const attempts = Math.max(1, attemptsUsed);
    if (isOpenAIRequestRejection(err)) return new ExtractionError('OPENAI_REQUEST_REJECTED', attempts, undefined, upstream);
    return new ExtractionError('OPENAI_UNAVAILABLE', attempts, undefined, upstream);
  };

  if (sync && remaining() - SYNC_RESERVE_MS <= 0) throw new ExtractionError('SYNC_BUDGET_EXCEEDED', 0);

  let first: { result: ChatCompletion; attempts: number };
  try {
    first = await request(p.messages, 3);
  } catch (err) {
    throw classify(err);
  }
  const usage = toUsage(first.result);
  const parsed = parseCompletion(first.result);
  if (parsed.ok) {
    return { result: parsed.result, usage, attempts: first.attempts, latencyMs: Date.now() - started, model };
  }
  if (parsed.refusal) throw new ExtractionError('INVALID_AI_OUTPUT', first.attempts, usage);

  // Repair retry, exactly once.
  if (sync && remaining() < SYNC_MIN_FOR_RETRY_MS) throw new ExtractionError('SYNC_BUDGET_EXCEEDED', first.attempts, usage);
  p.log.warn('extraction_repair_retry', { attempts: first.attempts });
  const repairMessages: ChatCompletionMessageParam[] = [
    ...p.messages,
    { role: 'assistant', content: parsed.content },
    { role: 'user', content: REPAIR_PROMPT },
  ];
  let repair: { result: ChatCompletion; attempts: number };
  try {
    repair = await request(repairMessages, 1);
  } catch (err) {
    const e = classify(err);
    throw new ExtractionError(e.code, first.attempts, usage, e.upstream);
  }
  const repairUsage = toUsage(repair.result);
  const repaired = parseCompletion(repair.result);
  if (!repaired.ok) {
    throw new ExtractionError('INVALID_AI_OUTPUT', first.attempts, {
      promptTokens: usage.promptTokens + repairUsage.promptTokens,
      completionTokens: usage.completionTokens + repairUsage.completionTokens,
    });
  }
  return {
    result: repaired.result,
    usage,
    repairUsage,
    attempts: first.attempts,
    latencyMs: Date.now() - started,
    model,
  };
}
