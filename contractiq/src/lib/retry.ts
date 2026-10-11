import OpenAI from 'openai';
import { TimeoutError } from '@/lib/api/errors';
import { ERROR_CATALOG } from '@/lib/api/error-catalog';
import { OPENAI_TIMEOUT_MS } from '@/lib/constants';
import { sleep } from '@/lib/utils';

export { sleep };

// Retry with backoff and an optional absolute deadline (00-foundation.md §6.8, README §3.4).
export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  factor: number;
  jitter: boolean;
  maxDelayMs?: number;
  /** Absolute epoch-ms deadline (sync processing). */
  deadlineAt?: number;
  minRemainingMsForRetry?: number;
  isRetryable: (err: unknown) => boolean;
  perAttemptTimeoutMs: number | ((remainingMs: number) => number);
};

export async function withRetry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  opts: RetryOptions,
): Promise<{ result: T; attempts: number }> {
  let lastErr: unknown;
  const maxDelay = opts.maxDelayMs ?? 30_000;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const remaining = opts.deadlineAt ? opts.deadlineAt - Date.now() : Infinity;
    if (remaining <= 0) break;
    const timeout =
      typeof opts.perAttemptTimeoutMs === 'function' ? opts.perAttemptTimeoutMs(remaining) : opts.perAttemptTimeoutMs;
    if (timeout <= 0) break;
    const signal = AbortSignal.timeout(timeout);
    try {
      return { result: await fn(attempt, signal), attempts: attempt };
    } catch (caught) {
      // When our per-attempt timeout fires, the OpenAI SDK reports a generic APIUserAbortError (not retryable).
      // Surface the TimeoutError itself so a hung request is retried and classified as a timeout.
      const err: unknown = signal.aborted && (signal.reason as { name?: string } | undefined)?.name === 'TimeoutError' ? signal.reason : caught;
      lastErr = err;
      const left = opts.deadlineAt ? opts.deadlineAt - Date.now() : Infinity;
      if (attempt === opts.attempts || !opts.isRetryable(err) || left < (opts.minRemainingMsForRetry ?? 0)) throw err;
      let delay = Math.min(maxDelay, opts.baseDelayMs * opts.factor ** (attempt - 1));
      const retryAfter = retryAfterMs(err);
      if (retryAfter !== null) delay = Math.max(delay, Math.min(retryAfter, maxDelay));
      if (opts.jitter) delay = Math.round(delay * (0.8 + Math.random() * 0.4));
      if (opts.deadlineAt) {
        delay = Math.min(delay, Math.max(0, opts.deadlineAt - Date.now() - (opts.minRemainingMsForRetry ?? 0)));
      }
      await sleep(delay);
    }
  }
  throw lastErr ?? new TimeoutError('UPSTREAM_TIMEOUT', 504, ERROR_CATALOG.UPSTREAM_TIMEOUT.message, true);
}

/** OpenAI 429s carry `retry-after-ms` or `retry-after` (seconds) headers. */
function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof OpenAI.APIError) || !err.headers) return null;
  const ms = Number(err.headers['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(err.headers['retry-after']);
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return null;
}

export function isRetryableOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true; // includes APIConnectionTimeoutError
  if (err instanceof OpenAI.APIError) return [429, 500, 502, 503, 504].includes(err.status ?? 0);
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return (
    e?.name === 'AbortError' ||
    e?.name === 'TimeoutError' ||
    ['ETIMEDOUT', 'ECONNRESET'].includes(e?.code ?? e?.cause?.code ?? '')
  );
}

/**
 * OpenAI rejected the request itself: a 4xx other than 429 (unsupported parameter, unknown model, bad key,
 * …). Retrying sends the same request and gets the same answer, so callers report it as non-retryable.
 */
export function isOpenAIRequestRejection(err: unknown): err is InstanceType<typeof OpenAI.APIError> {
  if (!(err instanceof OpenAI.APIError) || isRetryableOpenAIError(err)) return false;
  const status = err.status ?? 0;
  return status >= 400 && status < 500;
}

export type OpenAIErrorFields = {
  status: number | null;
  openai_type: string | null;
  openai_code: string | null;
  openai_param: string | null;
  openai_message: string | null;
};

/**
 * OpenAI's own diagnosis for `openai_request_failed` logs, e.g. code=unsupported_parameter
 * param=max_tokens. These describe the request, never echo prompt or contract content; the message is
 * capped anyway.
 */
export function openAIErrorFields(err: InstanceType<typeof OpenAI.APIError>): OpenAIErrorFields {
  const message = (err.error as { message?: unknown } | undefined)?.message;
  return {
    status: err.status ?? null,
    openai_type: err.type ?? null,
    openai_code: err.code ?? null,
    openai_param: err.param ?? null,
    openai_message: (typeof message === 'string' ? message : err.message).slice(0, 500),
  };
}

/** Background-mode preset. The sync preset is built per request (05-key-term-extraction.md). */
export const BACKGROUND_RETRY = {
  attempts: 3,
  baseDelayMs: 1000,
  factor: 2,
  jitter: true,
  maxDelayMs: 8000,
  perAttemptTimeoutMs: OPENAI_TIMEOUT_MS,
  isRetryable: isRetryableOpenAIError,
} satisfies RetryOptions;
