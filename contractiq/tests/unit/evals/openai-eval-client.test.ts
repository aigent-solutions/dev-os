import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvalClient, evalCallStats, recordingPath, ReplayMissError, requestHash, stableStringify } from '../../../evals/lib/openai-eval-client';
import { openAiJson } from '../../mocks/openai-handlers';
import { server } from '../../setup/msw';

// 15-evals.md §12.
const body = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'hi' }], temperature: 0.1, max_tokens: 10 };

describe('request hash', () => {
  it('is independent of key order', () => {
    expect(requestHash(body)).toBe(requestHash({ max_tokens: 10, temperature: 0.1, messages: [{ content: 'hi', role: 'user' }], model: 'gpt-4o' } as never));
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it('changes when the prompt changes', () => expect(requestHash(body)).not.toBe(requestHash({ ...body, messages: [{ role: 'user', content: 'hi!' }] })));
});

describe('record → replay', () => {
  it('record writes { request_hash, recorded_at, latency_ms, response }; replay serves it with no network', async () => {
    const recordingsDir = mkdtempSync(path.join(tmpdir(), 'ciq-rec-'));
    const opts = { promptVersion: 'extraction-v1.0', model: 'gpt-4o', recordingsDir };
    server.use(openAiJson('{"ok":true}'));
    const recorder = createEvalClient('record', opts);
    await recorder.chat.completions.create(body);
    const file = recordingPath(opts, 'gpt-4o', requestHash(body));
    expect(existsSync(file)).toBe(true);
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(rec).sort()).toEqual(['latency_ms', 'recorded_at', 'request_hash', 'response']);

    server.resetHandlers(); // any network call would now fail loudly
    const replay = createEvalClient('replay', opts);
    const res = (await replay.chat.completions.create(body)) as { choices: { message: { content: string } }[] };
    expect(res.choices[0]!.message.content).toBe('{"ok":true}');
    expect(evalCallStats(replay).calls).toHaveLength(1);
  });

  it('a replay miss throws ReplayMissError and is counted', async () => {
    const replay = createEvalClient('replay', { promptVersion: 'v', model: 'gpt-4o', recordingsDir: mkdtempSync(path.join(tmpdir(), 'ciq-rec-')) });
    await expect(replay.chat.completions.create(body)).rejects.toBeInstanceOf(ReplayMissError);
    expect(evalCallStats(replay).misses).toEqual([requestHash(body)]);
  });
});
