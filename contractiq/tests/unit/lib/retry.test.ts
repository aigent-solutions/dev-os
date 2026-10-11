import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOpenAIRequestRejection, isRetryableOpenAIError, openAIErrorFields, withRetry, type RetryOptions } from '@/lib/retry';

// 00-foundation.md §12.2.
afterEach(() => vi.useRealTimers());
const apiError = (status: number, headers: Record<string, string> = {}) => OpenAI.APIError.generate(status, { error: { message: 'x' } }, 'x', headers);
const opts = (over: Partial<RetryOptions> = {}): RetryOptions => ({
  attempts: 3, baseDelayMs: 1000, factor: 2, jitter: false, maxDelayMs: 8000, perAttemptTimeoutMs: 20_000, isRetryable: isRetryableOpenAIError, ...over,
});

describe('withRetry', () => {
  it('succeeds on attempt 2 after a 503', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValue('ok');
    const p = withRetry(fn, opts());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ result: 'ok', attempts: 2 });
  });

  it('does not retry a 400', async () => {
    const fn = vi.fn().mockRejectedValue(apiError(400));
    await expect(withRetry(fn, opts())).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops at `attempts` with backoff 1 s then 2 s', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(apiError(503));
    const p = withRetry(fn, opts()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(await p).toBeInstanceOf(OpenAI.APIError);
  });

  it('honours retry-after, capped by maxDelayMs', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(apiError(429, { 'retry-after': '30' })).mockResolvedValue('ok');
    const p = withRetry(fn, opts({ maxDelayMs: 5000 }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).attempts).toBe(2);
  });

  it('retry-after-ms wins over the backoff when larger', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(apiError(429, { 'retry-after-ms': '2500' })).mockResolvedValue('ok');
    const p = withRetry(fn, opts());
    await vi.advanceTimersByTimeAsync(2499);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe('deadline', () => {
    it('no attempt starts when the remaining time is ≤ 0', async () => {
      const fn = vi.fn();
      await expect(withRetry(fn, opts({ deadlineAt: Date.now() - 1 }))).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('no retry when the remaining time is under minRemainingMsForRetry', async () => {
      const fn = vi.fn().mockRejectedValue(apiError(503));
      await expect(withRetry(fn, opts({ deadlineAt: Date.now() + 5000, minRemainingMsForRetry: 8000 }))).rejects.toBeInstanceOf(OpenAI.APIError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('the per-attempt timeout comes from the remaining time', async () => {
      const seen: number[] = [];
      const fn = vi.fn(async () => 'ok');
      await withRetry(fn, opts({ deadlineAt: Date.now() + 10_000, perAttemptTimeoutMs: (remaining) => (seen.push(remaining), remaining - 1500) }));
      expect(seen[0]).toBeGreaterThan(9_900);
      expect(seen[0]).toBeLessThanOrEqual(10_000);
    });
  });

  it('a fired per-attempt timeout surfaces as a TimeoutError (retryable), not the SDK abort', async () => {
    const fn = vi.fn(async (_a: number, signal: AbortSignal) => {
      await new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new OpenAI.APIUserAbortError())));
    });
    const err = await withRetry(fn, opts({ attempts: 2, baseDelayMs: 1, perAttemptTimeoutMs: 20 })).catch((e: unknown) => e);
    expect((err as Error).name).toBe('TimeoutError');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isRetryableOpenAIError', () => {
  it.each([429, 500, 502, 503, 504])('%i → retryable', (s) => expect(isRetryableOpenAIError(apiError(s))).toBe(true));
  it.each([400, 401, 403, 404, 422])('%i → not retryable', (s) => expect(isRetryableOpenAIError(apiError(s))).toBe(false));
  it('a user abort is not retryable', () => expect(isRetryableOpenAIError(new OpenAI.APIUserAbortError())).toBe(false));
  it('a connection error, ECONNRESET and TimeoutError are retryable', () => {
    expect(isRetryableOpenAIError(new OpenAI.APIConnectionError({ message: 'x' }))).toBe(true);
    expect(isRetryableOpenAIError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableOpenAIError(new DOMException('t', 'TimeoutError'))).toBe(true);
  });
});

describe('isOpenAIRequestRejection', () => {
  it.each([400, 401, 403, 404, 422])('%i → a rejection (retrying sends the same bad request)', (s) => expect(isOpenAIRequestRejection(apiError(s))).toBe(true));
  it.each([429, 500, 502, 503, 504])('%i → not a rejection (retryable)', (s) => expect(isOpenAIRequestRejection(apiError(s))).toBe(false));
  it('connection errors, aborts and non-OpenAI errors are not rejections', () => {
    expect(isOpenAIRequestRejection(new OpenAI.APIConnectionError({ message: 'x' }))).toBe(false);
    expect(isOpenAIRequestRejection(new OpenAI.APIUserAbortError())).toBe(false);
    expect(isOpenAIRequestRejection(new Error('x'))).toBe(false);
  });
});

describe('openAIErrorFields', () => {
  it("carries OpenAI's type, code, param and raw message (the gpt-6-luna incident)", () => {
    const body = {
      error: {
        message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        type: 'invalid_request_error',
        param: 'max_tokens',
        code: 'unsupported_parameter',
      },
    };
    expect(openAIErrorFields(OpenAI.APIError.generate(400, body, undefined, {}))).toEqual({
      status: 400,
      openai_type: 'invalid_request_error',
      openai_code: 'unsupported_parameter',
      openai_param: 'max_tokens',
      openai_message: body.error.message,
    });
  });
  it('missing fields are null; the message is capped at 500 characters', () => {
    const f = openAIErrorFields(OpenAI.APIError.generate(404, { error: { message: 'm'.repeat(2000) } }, undefined, {}));
    expect(f).toMatchObject({ status: 404, openai_type: null, openai_code: null, openai_param: null });
    expect(f.openai_message).toHaveLength(500);
  });
});
