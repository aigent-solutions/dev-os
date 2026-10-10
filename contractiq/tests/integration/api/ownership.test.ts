import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as chatRoute from '@/app/api/contracts/[id]/chat/route';
import * as extractRoute from '@/app/api/contracts/[id]/extract/route';
import * as feedbackRoute from '@/app/api/contracts/[id]/feedback/route';
import * as processRoute from '@/app/api/contracts/[id]/process/route';
import * as contractRoute from '@/app/api/contracts/[id]/route';
import * as statusRoute from '@/app/api/contracts/[id]/status/route';
import * as contractsRoute from '@/app/api/contracts/route';
import * as summaryRoute from '@/app/api/dashboard/summary/route';
import * as keyTermRoute from '@/app/api/key-terms/[id]/route';
import { closeDb, sql } from '../../helpers/db';
import { contractPath, seedContract, seedContractChildren, uploadObject } from '../../helpers/factories';
import { adminClient, callRoute, signedInClient } from '../../helpers/supabase';
import { SEED_USERS, type SeededUser } from '../../setup/seed-users';

// Tenant isolation: Bob gets 404 (never 403, never data) for everything Alice owns, through every
// contract-scoped route and through direct RLS-scoped queries. Bodies are valid, so a 400 can't mask a missing 404.
let alice: SeededUser;
let bob: SeededUser;
let contractId: string;
let pendingId: string;
let termId: string;
let snapshot: string;

const userByEmail = async (email: string, password: string): Promise<SeededUser> => {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  return { id: data.users.find((u) => u.email === email)!.id, email, password };
};

/** Everything of Alice's that Bob's calls could change, as one comparable string. */
const aliceState = async () =>
  JSON.stringify(
    await sql(
      `select c.id, c.file_name, c.status, c.review_completed_at, c.file_path,
              (select json_agg(json_build_object('v', k.value, 'p', k.page_number, 'e', k.is_edited) order by k.id) from public.key_terms k where k.contract_id = c.id) terms,
              (select count(*) from public.chat_messages m where m.contract_id = c.id) msgs,
              (select json_agg(f.rating) from public.user_feedback f where f.contract_id = c.id) fb
       from public.contracts c where c.user_id = $1 order by c.id`,
      [alice.id],
    ),
  );

beforeAll(async () => {
  alice = await userByEmail(SEED_USERS.alice.email, SEED_USERS.alice.password);
  bob = await userByEmail(SEED_USERS.bob.email, SEED_USERS.bob.password);
  const c = await seedContract(alice.id, { status: 'completed' });
  contractId = c.id;
  await uploadObject(contractPath(alice.id, contractId));
  await adminClient().from('contracts').update({ file_path: contractPath(alice.id, contractId) }).eq('id', contractId);
  termId = (await seedContractChildren(contractId, alice.id)).termId;
  pendingId = (await seedContract(alice.id, { status: 'pending_upload', contract_text: null, page_count: null, word_count: null, token_count: null })).id;
  snapshot = await aliceState();
});
afterAll(closeDb);

type IdHandler = Parameters<typeof callRoute<{ id: string }>>[0];
type Call = { name: string; handler: IdHandler; method: string; id: () => string; path: () => string; body?: unknown };
const calls: Call[] = [
  { name: 'GET /contracts/[id]', handler: contractRoute.GET, method: 'GET', id: () => contractId, path: () => `/api/contracts/${contractId}` },
  { name: 'PATCH /contracts/[id]', handler: contractRoute.PATCH, method: 'PATCH', id: () => contractId, path: () => `/api/contracts/${contractId}`, body: { review_completed: true, file_name: 'pwned.pdf' } },
  { name: 'DELETE /contracts/[id]', handler: contractRoute.DELETE, method: 'DELETE', id: () => contractId, path: () => `/api/contracts/${contractId}` },
  { name: 'GET /contracts/[id]/status', handler: statusRoute.GET, method: 'GET', id: () => contractId, path: () => `/api/contracts/${contractId}/status` },
  { name: 'POST /contracts/[id]/extract (pending contract)', handler: extractRoute.POST, method: 'POST', id: () => pendingId, path: () => `/api/contracts/${pendingId}/extract`, body: {} },
  { name: 'POST /contracts/[id]/process', handler: processRoute.POST, method: 'POST', id: () => contractId, path: () => `/api/contracts/${contractId}/process`, body: { custom_terms: [] } },
  { name: 'GET /contracts/[id]/chat', handler: chatRoute.GET, method: 'GET', id: () => contractId, path: () => `/api/contracts/${contractId}/chat` },
  { name: 'POST /contracts/[id]/chat', handler: chatRoute.POST, method: 'POST', id: () => contractId, path: () => `/api/contracts/${contractId}/chat`, body: { message: 'What is the governing law?' } },
  { name: 'PUT /contracts/[id]/feedback', handler: feedbackRoute.PUT, method: 'PUT', id: () => contractId, path: () => `/api/contracts/${contractId}/feedback`, body: { rating: 'down', comment: 'pwned' } },
  { name: 'PATCH /key-terms/[id]', handler: keyTermRoute.PATCH, method: 'PATCH', id: () => termId, path: () => `/api/key-terms/${termId}`, body: { value: 'pwned', page_number: 1 } },
];

describe("Bob calling routes with Alice's ids", () => {
  it.each(calls)('$name → 404 NOT_FOUND', async (c) => {
    const res = await callRoute(c.handler, { method: c.method, path: c.path(), params: { id: c.id() }, body: c.body, user: bob });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it("left every one of Alice's rows unchanged", async () => {
    expect(await aliceState()).toBe(snapshot);
  });

  it("Bob's contract list and dashboard summary contain nothing of Alice's", async () => {
    const list = await callRoute(contractsRoute.GET, { path: '/api/contracts', user: bob });
    expect(list.status).toBe(200);
    expect(JSON.stringify(await list.json())).not.toContain(contractId);
    const summary = await callRoute(summaryRoute.GET, { path: '/api/dashboard/summary', user: bob });
    expect(summary.status).toBe(200);
    const s = (await summary.json()) as { total: number };
    expect(s.total).toBe(0);
  });

  it('an unknown contract id behaves exactly like a foreign one (no existence leak)', async () => {
    const res = await callRoute(contractRoute.GET, { path: `/api/contracts/${randomUUID()}`, params: { id: randomUUID() }, user: bob });
    expect(res.status).toBe(404);
  });
});

describe("Bob's RLS-scoped client", () => {
  it.each(['contracts', 'key_terms', 'custom_key_terms', 'chat_sessions', 'chat_messages', 'user_feedback'] as const)('cannot read Alice\'s %s', async (table) => {
    const bobdb = await signedInClient(bob);
    // Per-table column name; the union of table types can't express it, hence the cast.
    const column = (table === 'contracts' ? 'id' : 'contract_id') as never;
    const { data } = await bobdb.from(table).select('id').eq(column, contractId);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot update or delete Alice's contract", async () => {
    const bobdb = await signedInClient(bob);
    const upd = await bobdb.from('contracts').update({ file_name: 'pwned.pdf' }).eq('id', contractId).select();
    const del = await bobdb.from('contracts').delete().eq('id', contractId).select();
    expect(upd.data ?? []).toHaveLength(0);
    expect(del.data ?? []).toHaveLength(0);
    expect(await aliceState()).toBe(snapshot);
  });

  it("cannot download or remove Alice's PDF from Storage", async () => {
    const bobdb = await signedInClient(bob);
    const dl = await bobdb.storage.from('contracts').download(contractPath(alice.id, contractId));
    expect(dl.data).toBeNull();
    const signed = await bobdb.storage.from('contracts').createSignedUrl(contractPath(alice.id, contractId), 60);
    expect(signed.data).toBeNull();
    await bobdb.storage.from('contracts').remove([contractPath(alice.id, contractId)]);
    const [{ n }] = (await sql(`select count(*)::int n from storage.objects where bucket_id = 'contracts' and name = $1`, [contractPath(alice.id, contractId)])) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("cannot upload into Alice's folder", async () => {
    const bobdb = await signedInClient(bob);
    const { error } = await bobdb.storage.from('contracts').upload(`${alice.id}/${contractId}/evil.pdf`, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' });
    expect(error).not.toBeNull();
  });
});
