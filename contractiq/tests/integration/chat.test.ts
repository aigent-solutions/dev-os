import { createServer } from 'node:http';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as chatRoute from '@/app/api/contracts/[id]/chat/route';
import { closeDb, count, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../helpers/factories';
import { adminClient, callRoute, signedInClient } from '../helpers/supabase';
import { openAiError, openAiRejection, openAiStream, UNSUPPORTED_MAX_TOKENS } from '../mocks/openai-handlers';
import { server } from '../setup/msw';
import type { SeededUser } from '../setup/seed-users';

// 09-contract-chat.md §12 — POST/GET /api/contracts/{id}/chat against the local stack, OpenAI mocked.
type Event = { event: string; data: Record<string, unknown> };

/** Reads an SSE response to the end and parses its events (keep-alive comments ignored). */
async function events(res: Response): Promise<Event[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((block) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      return data.length ? { event, data: JSON.parse(data.join('\n')) as Record<string, unknown> } : null;
    })
    .filter((e): e is Event => e !== null);
}

const created: string[] = [];
async function owner(status: 'completed' | 'processing' = 'completed') {
  const user = await createTestUser();
  created.push(user.id);
  const c = await seedContract(user.id, { status });
  return { user, id: c.id };
}
const ask = (user: SeededUser, id: string, message = 'What is the governing law?') =>
  callRoute(chatRoute.POST, { method: 'POST', path: `/api/contracts/${id}/chat`, params: { id }, body: { message }, user });
const history = (user: SeededUser, id: string) => callRoute(chatRoute.GET, { path: `/api/contracts/${id}/chat`, params: { id }, user });
const messages = (id: string) =>
  sql<{ role: string; status: string; content: string; cited_pages: number[] }>(
    'select role, status, content, cited_pages from public.chat_messages where contract_id = $1 order by created_at, id', [id],
  );

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('POST /chat', () => {
  it('streams meta → token* → done, and stores the user and assistant rows', async () => {
    const { user, id } = await owner();
    server.use(openAiStream(['Based on the document, ', 'England and Wales ', '[Page 2].']));
    const res = await ask(user, id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const ev = await events(res);
    expect(ev.map((e) => e.event)).toEqual(['meta', 'token', 'token', 'token', 'done']);
    const done = ev.at(-1)!.data;
    expect(done).toMatchObject({ content: 'Based on the document, England and Wales [Page 2].', cited_pages: [2], is_not_found: false, citation_missing: false });

    const rows = await messages(id);
    expect(rows).toEqual([
      { role: 'user', status: 'complete', content: 'What is the governing law?', cited_pages: [] },
      { role: 'assistant', status: 'complete', content: done.content, cited_pages: [2] },
    ]);
    const assistant = (await sql<{ id: string }>("select id from public.chat_messages where contract_id = $1 and role = 'assistant'", [id]))[0]!;
    expect(done.message_id).toBe(assistant.id);
    expect(await count("select count(*) from public.ai_usage_logs where contract_id = $1 and operation = 'chat' and success", [id])).toBe(1);
  });

  it('upstream 503 × 3 → error UPSTREAM_UNAVAILABLE; user row saved, no assistant row; usage success=false, attempts=3', async () => {
    const { user, id } = await owner();
    server.use(openAiError(503));
    const ev = await events(await ask(user, id));
    expect(ev.map((e) => e.event)).toEqual(['meta', 'error']);
    expect(ev[1]!.data).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', partial: false, message_id: null });
    expect((await messages(id)).map((m) => m.role)).toEqual(['user']);
    const [usage] = await sql<{ success: boolean; attempts: number; error_code: string }>('select success, attempts, error_code from public.ai_usage_logs where contract_id = $1', [id]);
    expect(usage).toEqual({ success: false, attempts: 3, error_code: 'UPSTREAM_UNAVAILABLE' });
  }, 15_000);

  it("upstream 400 (request rejected) → UPSTREAM_REJECTED, not retryable, after 1 request; OpenAI's diagnosis logged", async () => {
    const { user, id } = await owner();
    let requests = 0;
    server.events.on('request:start', ({ request }) => void (request.url.includes('api.openai.com') && requests++));
    server.use(openAiRejection());
    const ev = await events(await ask(user, id));
    server.events.removeAllListeners('request:start');
    expect(ev.map((e) => e.event)).toEqual(['meta', 'error']);
    expect(ev[1]!.data).toMatchObject({ code: 'UPSTREAM_REJECTED', retryable: false, message: expect.stringContaining('contact support') });
    expect(requests).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(errors.find((l) => l.msg === 'openai_request_failed')).toMatchObject({
      code: 'UPSTREAM_REJECTED',
      status: 400,
      openai_code: UNSUPPORTED_MAX_TOKENS.code,
      openai_param: UNSUPPORTED_MAX_TOKENS.param,
      openai_message: UNSUPPORTED_MAX_TOKENS.message,
    });
  });

  it('upstream 503 errors stay retryable for the user', async () => {
    const { user, id } = await owner();
    server.use(openAiError(503));
    const ev = await events(await ask(user, id));
    expect(ev[1]!.data).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
  }, 15_000);

  // A real socket reset through a local server: MSW's interception of the SDK's node-fetch never surfaces a
  // mid-body error (the read just hangs until the 24 s cap), while a real reset throws "Premature close" at once.
  it('a mid-stream connection reset saves the partial answer as an error row, promptly', async () => {
    const { user, id } = await owner();
    const chunk = (d: string) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { content: d } }] })}\n\n`;
    const upstream = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(chunk('Based on the document, the law is '));
      setTimeout(() => req.socket.destroy(), 50);
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    server.close(); // real network for this test
    try {
      vi.resetModules();
      vi.stubEnv('OPENAI_BASE_URL', `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`);
      const route = await import('@/app/api/contracts/[id]/chat/route');
      const started = Date.now();
      const ev = await events(await callRoute(route.POST, { method: 'POST', path: `/api/contracts/${id}/chat`, params: { id }, body: { message: 'What is the governing law?' }, user }));
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(ev.map((e) => e.event)).toEqual(['meta', 'token', 'error']);
      expect(ev.at(-1)!.data).toMatchObject({ partial: true });
      expect(ev.at(-1)!.data.message_id).toBeTruthy();
      const rows = await messages(id);
      expect(rows[1]).toMatchObject({ role: 'assistant', status: 'error', content: 'Based on the document, the law is ' });
    } finally {
      vi.unstubAllEnvs();
      upstream.close();
      server.listen({ onUnhandledRequest: (request, print) => (new URL(request.url).hostname === 'api.openai.com' ? print.error() : undefined) });
    }
  });

  it('a contract still processing → 409 CONTRACT_NOT_READY (before any stream)', async () => {
    const { user, id } = await owner('processing');
    const res = await ask(user, id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('CONTRACT_NOT_READY');
  });

  it("another user → 404 on both GET and POST", async () => {
    const { id } = await owner();
    const other = await createTestUser();
    created.push(other.id);
    expect((await history(other, id)).status).toBe(404);
    expect((await ask(other, id)).status).toBe(404);
  });

  it('the 31st question within 10 minutes → 429 with Retry-After', async () => {
    const { user, id } = await owner();
    server.use(openAiStream(['I cannot find this in the document.']));
    for (let i = 0; i < 30; i++) {
      const res = await ask(user, id, `Question ${i}?`);
      expect(res.status, `request ${i + 1}`).toBe(200);
      await res.text();
    }
    const res = await ask(user, id, 'One too many?');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await count("select count(*) from public.chat_messages where contract_id = $1 and role = 'user'", [id])).toBe(30);
  }, 60_000);
});

describe('GET /chat', () => {
  it('returns the newest 200 of 205 messages, ascending', async () => {
    const { user, id } = await owner();
    const admin = adminClient();
    const { data: session } = await admin.from('chat_sessions').insert({ contract_id: id, user_id: user.id }).select('id').single();
    const base = Date.now() - 300_000;
    const rows = Array.from({ length: 205 }, (_, i) => ({
      session_id: session!.id, contract_id: id, user_id: user.id, role: 'user' as const, content: `m${i}`, created_at: new Date(base + i * 1000).toISOString(),
    }));
    const { error } = await admin.from('chat_messages').insert(rows);
    if (error) throw error;
    const body = (await (await history(user, id)).json()) as { messages: { content: string }[] };
    expect(body.messages).toHaveLength(200);
    expect(body.messages[0]!.content).toBe('m5');
    expect(body.messages.at(-1)!.content).toBe('m204');
  });
});

describe('chat_messages RLS (user JWT)', () => {
  async function withSession() {
    const { user, id } = await owner();
    const { data } = await adminClient().from('chat_sessions').insert({ contract_id: id, user_id: user.id }).select('id').single();
    return { user, id, sessionId: data!.id, db: await signedInClient(user) };
  }

  it('cannot insert an assistant message', async () => {
    const { user, id, sessionId, db } = await withSession();
    const { error } = await db.from('chat_messages').insert({ session_id: sessionId, contract_id: id, user_id: user.id, role: 'assistant', content: 'APPROVED' });
    expect(error).not.toBeNull();
  });

  it('cannot insert a user message with cited_pages', async () => {
    const { user, id, sessionId, db } = await withSession();
    const { error } = await db.from('chat_messages').insert({ session_id: sessionId, contract_id: id, user_id: user.id, role: 'user', content: 'q', cited_pages: [1] });
    expect(error).not.toBeNull();
  });

  it("cannot insert into another user's session", async () => {
    const victim = await withSession();
    const attacker = await createTestUser();
    created.push(attacker.id);
    const db = await signedInClient(attacker);
    const { error } = await db.from('chat_messages').insert({ session_id: victim.sessionId, contract_id: victim.id, user_id: attacker.id, role: 'user', content: 'hi' });
    expect(error).not.toBeNull();
    expect(await count('select count(*) from public.chat_messages where session_id = $1', [victim.sessionId])).toBe(0);
  });

  it('can insert its own plain user message (control)', async () => {
    const { user, id, sessionId, db } = await withSession();
    const { error } = await db.from('chat_messages').insert({ session_id: sessionId, contract_id: id, user_id: user.id, role: 'user', content: 'q' });
    expect(error).toBeNull();
  });
});
