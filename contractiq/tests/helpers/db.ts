import { Pool } from 'pg';
import { assertLocalSupabase } from '../setup/local-only';

// Direct Postgres access for checks PostgREST can't do: catalog queries, storage.objects, auth.users,
// and back-dating timestamps. Local stack only (DB_URL from `supabase status -o env`).
let pool: Pool | undefined;

export function db(): Pool {
  assertLocalSupabase();
  const url = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Refusing to connect to non-local DB_URL ${url}`);
  return (pool ??= new Pool({ connectionString: url, max: 2 }));
}

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query<T>(text, params)).rows;
}

/** First column of the first row as a number (for `select count(*) …`). */
export async function count(text: string, params: unknown[] = []): Promise<number> {
  const rows = await sql(text, params);
  return Number(Object.values(rows[0] ?? {})[0] ?? 0);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
