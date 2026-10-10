/**
 * Local OpenAI stand-in for E2E (00-foundation.md §12.1). Run with `tsx tests/mocks/openai-mock-server.ts`
 * and point the app at it with OPENAI_BASE_URL=http://localhost:4010/v1 (the openai SDK reads it natively).
 *
 * POST /v1/chat/completions answers from fixture files in tests/fixtures/openai/:
 *   - requests with `response_format` (extraction) → extraction.json (the message content, a JSON string)
 *   - requests with `stream: true` (chat)          → chat.txt (streamed word by word)
 * A missing fixture returns 501 so a test fails loudly instead of hanging.
 *
 * Per-test overrides (parallel-safe): POST /__mock/override { match, kind, status?, times?, text? } applies only to
 * requests whose raw body contains `match` (a unique token in that test's PDF or question). `kind` is 'chat'
 * (streamed) or 'extraction' (response_format). `status` answers with that HTTP error; `text` replaces the
 * fixture content. `times` limits how often it applies (default: always).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.OPENAI_MOCK_PORT ?? 4010);
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'openai');
const usage = { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 };

function fixture(name: string): string | null {
  const file = path.join(FIXTURES, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

type Override = { match: string; kind: 'chat' | 'extraction'; status?: number; times?: number; text?: string };
const overrides: Override[] = [];

function takeOverride(raw: string, kind: Override['kind']): Override | null {
  const o = overrides.find((x) => x.kind === kind && raw.includes(x.match) && (x.times === undefined || x.times > 0));
  if (!o) return null;
  if (o.times !== undefined) o.times--;
  return o;
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__mock/override') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      overrides.push(JSON.parse(body) as Override);
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}') as { stream?: boolean; response_format?: unknown; model?: string };
    const model = body.model ?? 'gpt-4o';
    const override = takeOverride(raw, body.stream ? 'chat' : 'extraction');
    if (override?.status) {
      res.writeHead(override.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: `mock ${override.status}`, type: 'server_error' } }));
      return;
    }

    if (body.stream) {
      const text = override?.text ?? fixture('chat.txt');
      if (text === null) return missing(res, 'chat.txt');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const base = { id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: 0, model };
      for (const word of text.split(/(?<=\s)/)) {
        res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: word } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, choices: [], usage })}\n\n`);
      res.end('data: [DONE]\n\n');
      return;
    }

    const content = override?.text ?? fixture(body.response_format ? 'extraction.json' : 'completion.txt');
    if (content === null) return missing(res, body.response_format ? 'extraction.json' : 'completion.txt');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: 0,
        model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
        usage,
      }),
    );
  });
});

function missing(res: import('node:http').ServerResponse, name: string) {
  res
    .writeHead(501, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ error: { message: `openai-mock-server: no fixture tests/fixtures/openai/${name}` } }));
}

server.listen(PORT, () => console.log(`openai-mock-server listening on :${PORT}`));
