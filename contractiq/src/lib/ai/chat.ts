import '@/lib/server-guard'; // loaded by evals (00 §6.12)
import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { CHAT_STREAM_TIMEOUT_MS, OPENAI_TIMEOUT_MS } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { isRetryableOpenAIError, withRetry } from '@/lib/retry';
import type { ChatQueryType, ChatRole, ContractType } from '@/types/domain';
import { getOpenAI, hashUserId } from './openai-client';
import { getChatPrompt } from './prompts';
import { countTokens } from './token-count';

export { CHAT_STREAM_TIMEOUT_MS };

export type HistoryMessage = { role: ChatRole; content: string };
const PER_MESSAGE_OVERHEAD = 4;

/**
 * Drops the oldest history (a user message together with its assistant reply) until the request fits
 * the budget (09 §6.8). The UI still shows everything; this only trims the model's context.
 */
export function trimHistoryToBudget(history: HistoryMessage[], fixedTokens: number, maxInputTokens: number): HistoryMessage[] {
  const out = [...history];
  const cost = (m: HistoryMessage) => countTokens(m.content) + PER_MESSAGE_OVERHEAD;
  let total = fixedTokens + out.reduce((n, m) => n + cost(m), 0);
  while (total > maxInputTokens && out.length) {
    const drop = out[0]!.role === 'user' && out[1]?.role === 'assistant' ? 2 : 1;
    for (const m of out.splice(0, drop)) total -= cost(m);
  }
  return out;
}

/** system (contract inside) → history (ascending) → the question, always last as a `user` message. */
export function buildChatMessages(p: {
  version: string;
  contractType: ContractType;
  contractText: string;
  queryType: ChatQueryType;
  history: HistoryMessage[];
  question: string;
  maxInputTokens: number;
}): ChatCompletionMessageParam[] {
  const system = getChatPrompt(p.version).buildChatSystemPrompt({
    contractType: p.contractType,
    queryType: p.queryType,
    contractText: p.contractText,
  });
  const fixed = countTokens(system) + countTokens(p.question) + 2 * PER_MESSAGE_OVERHEAD;
  const history = trimHistoryToBudget(p.history, fixed, p.maxInputTokens);
  return [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: p.question },
  ];
}

export type ChatChunk = { type: 'delta'; text: string } | { type: 'usage'; usage: { promptTokens: number; completionTokens: number } };
// NOT_FOUND: the contract was deleted while the answer streamed (13 §10); set by chat.service, never by the stream.
export type ChatErrorCode = 'CLIENT_ABORTED' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'INTERNAL_ERROR' | 'NOT_FOUND';

export class ChatStreamError extends Error {
  constructor(
    public code: ChatErrorCode,
    public attempts: number,
  ) {
    super(code);
    this.name = 'ChatStreamError';
  }
}

function toChunks(chunk: ChatCompletionChunk): ChatChunk[] {
  const out: ChatChunk[] = [];
  const text = chunk.choices[0]?.delta?.content;
  if (text) out.push({ type: 'delta', text });
  if (chunk.usage) {
    out.push({ type: 'usage', usage: { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens } });
  }
  return out;
}

/**
 * Streams the answer (09 §6.9). Retries (3 attempts, backoff, retry-after) only until the first delta;
 * after that any error ends the stream. 20 s first-token timeout per attempt; 24 s for the whole answer
 * (< Netlify's 26 s). A client abort is never retried. Errors are thrown as ChatStreamError.
 */
export async function* streamChatCompletion(p: {
  messages: ChatCompletionMessageParam[];
  userId: string;
  signal: AbortSignal;
  client?: OpenAI;
  stats?: { attempts: number };
}): AsyncGenerator<ChatChunk> {
  const client = p.client ?? getOpenAI();
  const total = AbortSignal.timeout(CHAT_STREAM_TIMEOUT_MS);
  const stats = p.stats ?? { attempts: 0 };

  const classify = (err: unknown): ChatStreamError => {
    if (err instanceof ChatStreamError) return err;
    if (p.signal.aborted) return new ChatStreamError('CLIENT_ABORTED', stats.attempts);
    const name = (err as { name?: string })?.name;
    if (total.aborted || name === 'TimeoutError' || err instanceof OpenAI.APIConnectionTimeoutError) {
      return new ChatStreamError('UPSTREAM_TIMEOUT', stats.attempts);
    }
    if (isRetryableOpenAIError(err) || err instanceof OpenAI.APIError) return new ChatStreamError('UPSTREAM_UNAVAILABLE', stats.attempts);
    return new ChatStreamError('INTERNAL_ERROR', stats.attempts);
  };

  type Opened = { iter: AsyncIterator<ChatCompletionChunk> | null; buffered: ChatChunk[] };
  let opened: Opened;
  try {
    ({ result: opened } = await withRetry<Opened>(
      async (attempt) => {
        stats.attempts = attempt;
        const firstToken = new AbortController();
        const timer = setTimeout(
          () => firstToken.abort(new DOMException('No first token within the time limit', 'TimeoutError')),
          OPENAI_TIMEOUT_MS,
        );
        const signal = AbortSignal.any([p.signal, total, firstToken.signal]);
        try {
          const stream = await client.chat.completions.create(
            {
              model: serverEnv.OPENAI_CHAT_MODEL,
              messages: p.messages,
              temperature: 0.4,
              max_tokens: 1000,
              stream: true,
              stream_options: { include_usage: true },
              store: false,
              user: hashUserId(p.userId),
            },
            { signal },
          );
          const iter = stream[Symbol.asyncIterator]();
          const buffered: ChatChunk[] = [];
          for (;;) {
            const r = await iter.next();
            if (r.done) {
              // The SDK ends the stream quietly when its signal aborts, so check: an abort is not an empty completion.
              if (signal.aborted) throw signal.reason;
              return { iter: null, buffered }; // empty completion
            }
            const chunks = toChunks(r.value);
            buffered.push(...chunks);
            if (chunks.some((c) => c.type === 'delta')) return { iter, buffered }; // first token: no more retries
          }
        } catch (err) {
          // Our first-token timer fired (not Stop, not the 24 s limit). The SDK reports that as a generic
          // APIUserAbortError, so rethrow the TimeoutError: it is retried, then classified UPSTREAM_TIMEOUT.
          if (firstToken.signal.aborted && !p.signal.aborted && !total.aborted) throw firstToken.signal.reason;
          throw err;
        } finally {
          clearTimeout(timer);
        }
      },
      {
        attempts: 3,
        baseDelayMs: 1000,
        factor: 2,
        jitter: true,
        maxDelayMs: 8000,
        perAttemptTimeoutMs: CHAT_STREAM_TIMEOUT_MS, // the real limits are the first-token and total signals above
        isRetryable: (err) => !p.signal.aborted && !total.aborted && isRetryableOpenAIError(err),
      },
    ));
  } catch (err) {
    throw classify(err);
  }

  yield* opened.buffered;
  if (!opened.iter) return;
  try {
    for (;;) {
      const r = await opened.iter.next();
      if (r.done) {
        // Same quiet end on abort (Stop / disconnect / 24 s limit): don't let a partial pass as complete.
        if (p.signal.aborted || total.aborted) throw classify(p.signal.reason ?? total.reason);
        return;
      }
      yield* toChunks(r.value);
    }
  } catch (err) {
    throw classify(err);
  }
}
