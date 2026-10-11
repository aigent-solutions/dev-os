import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../../helpers/db';

// 00-foundation.md §12.3 — the same catalog checks CI runs through scripts/verify-rls.sh.
const TABLES = ['ai_usage_logs', 'audit_events', 'chat_messages', 'chat_sessions', 'contracts', 'custom_key_terms', 'key_terms', 'profiles', 'rate_limits', 'user_feedback'];

afterAll(closeDb);

describe('RLS catalog', () => {
  it('verify-rls.sql returns no rows (every table has RLS and a policy; server-only tables have no client grants)', async () => {
    const query = readFileSync(path.join(__dirname, '../../../scripts/sql/verify-rls.sql'), 'utf8');
    const rows = await sql(query);
    expect(rows).toEqual([]);
  });

  it('all 10 app tables exist with row level security enabled', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual(TABLES);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
