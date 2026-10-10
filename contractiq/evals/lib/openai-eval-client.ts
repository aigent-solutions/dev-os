// live | replay | record OpenAI client for the evals (15-evals.md §6.5). Injected into the app's
// callExtractionModel / streamChatCompletion through their `client` parameter.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParams } from 'openai/resources/chat/completions';
import type { EvalMode } from './cli';

export class ReplayMissError extends Error {
  constructor(public hash: string) {
    super(`No recording for request ${hash}`);
    this.name = 'ReplayMissError';
  }
}

type StreamRecording = { stream: true; text: string; usage: { prompt_tokens: number; completion_tokens: number } | null };
export type Recording = {
  request_hash: string;
  recorded_at: string;
  latency_ms: number;
  response: ChatCompletion | StreamRecording;
};

/** Per-client call log. The app converts a ReplayMissError into its own error types, so misses are read from here. */
export type EvalCallStats = { calls: { hash: string; latencyMs: number }[]; misses: string[] };

const stats = new WeakMap<OpenAI, EvalCallStats>();
export function evalCallStats(client: OpenAI): EvalCallStats {
  const s = stats.get(client);
  if (!s) throw new Error('Not an eval client');
  return s;
}

/** JSON with object keys sorted at every level, so key order never changes the hash. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** sha256 over the full prompt: any change to prompt, few-shots, term list or contract text → new hash. */
export function requestHash(body: Pick<ChatCompletionCreateParams, 'model' | 'messages' | 'response_format' | 'temperature' | 'max_tokens'>): string {
  const { model, messages, response_format, temperature, max_tokens } = body;
  return createHash('sha256').update(stableStringify({ model, messages, response_format, temperature, max_tokens })).digest('hex');
}

export type EvalClientOptions = { promptVersion: string; model: string; recordingsDir: string };

export function recordingPath(opts: EvalClientOptions, model: string, hash: string): string {
  return path.join(opts.recordingsDir, opts.promptVersion, model, `${hash}.json`);
}

async function* replayStream(rec: StreamRecording): AsyncGenerator<ChatCompletionChunk> {
  const base = { id: 'chatcmpl-replay', object: 'chat.completion.chunk' as const, created: 0, model: 'replay' };
  if (rec.text) yield { ...base, choices: [{ index: 0, delta: { content: rec.text }, finish_reason: null, logprobs: null }] };
  if (rec.usage) {
    yield { ...base, choices: [], usage: { ...rec.usage, total_tokens: rec.usage.prompt_tokens + rec.usage.completion_tokens } };
  }
}

/**
 * An OpenAI-shaped client. Only `chat.completions.create` is implemented — the one method the app's AI
 * functions call. `user` is always 'eval' and `store` false.
 */
export function createEvalClient(mode: EvalMode, opts: EvalClientOptions): OpenAI {
  const real = mode === 'replay' ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const callStats: EvalCallStats = { calls: [], misses: [] };

  const create = async (body: ChatCompletionCreateParams, reqOpts?: { signal?: AbortSignal }): Promise<unknown> => {
    const model = body.model ?? opts.model;
    const hash = requestHash(body);
    const file = recordingPath(opts, model, hash);

    if (mode === 'replay') {
      if (!existsSync(file)) {
        callStats.misses.push(hash);
        throw new ReplayMissError(hash);
      }
      const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
      callStats.calls.push({ hash, latencyMs: rec.latency_ms });
      const res = rec.response;
      if ('stream' in res) return replayStream(res);
      return res;
    }

    const started = Date.now();
    const forwarded = { ...body, user: 'eval', store: false } as ChatCompletionCreateParams;
    const write = (response: Recording['response']) => {
      const latency = Date.now() - started;
      callStats.calls.push({ hash, latencyMs: latency });
      if (mode !== 'record') return;
      mkdirSync(path.dirname(file), { recursive: true });
      const rec: Recording = { request_hash: hash, recorded_at: new Date().toISOString(), latency_ms: latency, response };
      writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
    };

    if (body.stream) {
      const stream = (await real!.chat.completions.create(forwarded, reqOpts)) as AsyncIterable<ChatCompletionChunk>;
      return (async function* () {
        let text = '';
        let usage: StreamRecording['usage'] = null;
        for await (const chunk of stream) {
          text += chunk.choices[0]?.delta?.content ?? '';
          if (chunk.usage) usage = { prompt_tokens: chunk.usage.prompt_tokens, completion_tokens: chunk.usage.completion_tokens };
          yield chunk;
        }
        write({ stream: true, text, usage });
      })();
    }
    const response = (await real!.chat.completions.create(forwarded, reqOpts)) as ChatCompletion;
    write(response);
    return response;
  };

  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  stats.set(client, callStats);
  return client;
}
