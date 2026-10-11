import { NextRequest } from 'next/server';
import { cookieJar } from '../setup/next-headers-mock';
import type { SeededUser } from '../setup/seed-users';
import { adminClient, sessionCookies } from './session';

export { adminClient, sessionCookies, signedInClient } from './session';

type RouteHandler<P> = (req: NextRequest, ctx: { params: P }) => Promise<Response>;

/** Invokes a route handler as `user` (or signed out), with that user's auth cookies. */
export async function callRoute<P extends Record<string, string>>(
  handler: RouteHandler<P>,
  opts: { method?: string; path: string; params?: P; body?: unknown; user?: SeededUser; headers?: Record<string, string> },
): Promise<Response> {
  const cookies = opts.user ? await sessionCookies(opts.user) : [];
  cookieJar.reset(cookies);
  const req = new NextRequest(new URL(opts.path, 'http://localhost:3000'), {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookies.length ? { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } : {}),
      ...opts.headers, // e.g. a cross-site Origin, or a non-JSON Content-Type (security tests)
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return handler(req, { params: (opts.params ?? {}) as P });
}

/** App tables, children first. Used between integration test files. */
const APP_TABLES = [
  'audit_events',
  'chat_messages',
  'chat_sessions',
  'key_terms',
  'custom_key_terms',
  'user_feedback',
  'ai_usage_logs',
  'rate_limits',
  'contracts',
] as const;

export async function resetAppTables(): Promise<void> {
  const admin = adminClient();
  for (const table of APP_TABLES) {
    // PostgREST refuses an unfiltered delete, so filter on a column that is never null.
    const column = table === 'rate_limits' ? 'user_id' : 'id';
    const { error } = await admin.from(table).delete().not(column, 'is', null);
    if (error) throw new Error(`resetAppTables(${table}): ${error.message}`);
  }
}
