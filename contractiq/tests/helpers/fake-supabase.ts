import { vi } from 'vitest';

// A minimal stand-in for a supabase-js client in unit tests. Every `from(table)` chain is recorded and,
// when awaited, answered by `onQuery(query)`. Storage calls go to `onStorage`.
export type FakeQuery = { table: string; op: 'select' | 'update' | 'delete' | 'insert' | 'rpc'; payload?: unknown; filters: [string, ...unknown[]][] };
export type FakeResult = { data?: unknown; error?: unknown; count?: number | null };

export function fakeSupabase(handlers: {
  onQuery?: (q: FakeQuery) => FakeResult;
  onStorage?: (call: { method: 'list' | 'remove'; bucket: string; args: unknown[] }) => FakeResult;
  onDeleteUser?: (id: string) => FakeResult;
}) {
  const queries: FakeQuery[] = [];
  const storageCalls: { method: 'list' | 'remove'; bucket: string; args: unknown[] }[] = [];

  const builder = (q: FakeQuery) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'neq', 'in', 'lt', 'gt', 'lte', 'gte', 'not', 'is', 'order', 'limit', 'range', 'select', 'single', 'maybeSingle']) {
      chain[m] = (...args: unknown[]) => {
        q.filters.push([m, ...args]);
        return chain;
      };
    }
    chain.then = (resolve: (r: FakeResult) => unknown, reject: (e: unknown) => unknown) => {
      queries.push(q);
      try {
        const r = handlers.onQuery?.(q) ?? { data: [], error: null };
        return Promise.resolve({ data: null, error: null, count: null, ...r }).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return chain;
  };

  const client = {
    rpc: (fn: string, args?: unknown) => builder({ table: fn, op: 'rpc', payload: args, filters: [] }),
    from: (table: string) => ({
      select: (...args: unknown[]) => builder({ table, op: 'select', payload: args[0], filters: [] }),
      update: (payload: unknown) => builder({ table, op: 'update', payload, filters: [] }),
      delete: (opts?: unknown) => builder({ table, op: 'delete', payload: opts, filters: [] }),
      insert: (payload: unknown) => builder({ table, op: 'insert', payload, filters: [] }),
    }),
    storage: {
      from: (bucket: string) => ({
        list: async (...args: unknown[]) => {
          storageCalls.push({ method: 'list', bucket, args });
          return { data: [], error: null, ...handlers.onStorage?.({ method: 'list', bucket, args }) };
        },
        remove: async (...args: unknown[]) => {
          storageCalls.push({ method: 'remove', bucket, args });
          return { data: [], error: null, ...handlers.onStorage?.({ method: 'remove', bucket, args }) };
        },
      }),
    },
    auth: { admin: { deleteUser: vi.fn(async (id: string) => ({ data: null, error: null, ...handlers.onDeleteUser?.(id) })) } },
  };
  return { client, queries, storageCalls };
}

/** The value passed to a recorded filter, e.g. filter(q, 'lt')[1]. */
export const filter = (q: FakeQuery, name: string) => q.filters.find((f) => f[0] === name);
