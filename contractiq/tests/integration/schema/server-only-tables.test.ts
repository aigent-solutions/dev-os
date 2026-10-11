import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, count } from '../../helpers/db';
import { adminClient, signedInClient } from '../../helpers/supabase';
import { seedContract } from '../../helpers/factories';
import { SEED_USERS, type SeededUser } from '../../setup/seed-users';

// 00-foundation.md §12.3 — rate_limits, ai_usage_logs and (Stage 7) audit_events are service-role only, even for
// the owner's own rows.
let alice: SeededUser;
let contractId: string;

beforeAll(async () => {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const u = data.users.find((x) => x.email === SEED_USERS.alice.email)!;
  alice = { id: u.id, ...SEED_USERS.alice };
  contractId = (await seedContract(alice.id)).id;
  const admin = adminClient();
  const usage = await admin.from('ai_usage_logs').insert({
    user_id: alice.id, contract_id: contractId, operation: 'extraction', model: 'gpt-4o', prompt_version: 'extraction-v1.0',
    prompt_tokens: 1, completion_tokens: 1, cost_usd: 0, latency_ms: 1, success: true,
  });
  const rl = await admin.from('rate_limits').insert({ user_id: alice.id, bucket: 'upload', window_start: new Date().toISOString(), count: 1 });
  if (usage.error || rl.error) throw usage.error ?? rl.error;
});
afterAll(closeDb);

const denied = (error: { code?: string; message: string } | null) => !!error && (error.code === '42501' || /permission denied/i.test(error.message));

describe.each(['rate_limits', 'ai_usage_logs'] as const)('%s as the signed-in owner', (table) => {
  it('select is denied', async () => {
    const alicedb = await signedInClient(alice);
    const { data, error } = await alicedb.from(table).select('*');
    expect(denied(error) || (data ?? []).length === 0).toBe(true);
  });

  it('insert is denied', async () => {
    const alicedb = await signedInClient(alice);
    const row =
      table === 'rate_limits'
        ? { user_id: alice.id, bucket: 'chat', window_start: new Date().toISOString(), count: 1 }
        : { user_id: alice.id, operation: 'chat', model: 'x', prompt_version: 'x', latency_ms: 1, success: true };
    const { error } = await alicedb.from(table).insert(row as never);
    expect(denied(error)).toBe(true);
  });

  it('update and delete change nothing', async () => {
    const alicedb = await signedInClient(alice);
    const before = await count(`select count(*) from public.${table} where user_id = $1`, [alice.id]);
    const upd = await alicedb.from(table).update({ user_id: alice.id } as never).eq('user_id', alice.id).select();
    const del = await alicedb.from(table).delete().eq('user_id', alice.id).select();
    expect(denied(upd.error) || (upd.data ?? []).length === 0).toBe(true);
    expect(denied(del.error) || (del.data ?? []).length === 0).toBe(true);
    expect(await count(`select count(*) from public.${table} where user_id = $1`, [alice.id])).toBe(before);
  });
});

describe('audit_events (Stage 7) as the signed-in actor', () => {
  it("the user can't read, write, change or delete audit rows about themselves", async () => {
    const admin = adminClient();
    const seeded = await admin.from('audit_events').insert({ event: 'contract.deleted', actor_user_id: alice.id, target_type: 'contract', target_id: contractId }).select('id').single();
    if (seeded.error) throw seeded.error;
    const alicedb = await signedInClient(alice);
    const sel = await alicedb.from('audit_events').select('*');
    expect(denied(sel.error) || (sel.data ?? []).length === 0).toBe(true);
    const ins = await alicedb.from('audit_events').insert({ event: 'account.deleted', actor_user_id: alice.id });
    expect(denied(ins.error)).toBe(true);
    const before = await count('select count(*) from public.audit_events where actor_user_id = $1', [alice.id]);
    const upd = await alicedb.from('audit_events').update({ event: 'contract.uploaded' }).eq('actor_user_id', alice.id).select();
    const del = await alicedb.from('audit_events').delete().eq('actor_user_id', alice.id).select();
    expect(denied(upd.error) || (upd.data ?? []).length === 0).toBe(true);
    expect(denied(del.error) || (del.data ?? []).length === 0).toBe(true);
    expect(await count('select count(*) from public.audit_events where actor_user_id = $1', [alice.id])).toBe(before);
  });

  it('is append-only even for the service role: an UPDATE is rejected by the trigger', async () => {
    const admin = adminClient();
    const { data } = await admin.from('audit_events').insert({ event: 'contract.uploaded', actor_user_id: alice.id }).select('id').single();
    const upd = await admin.from('audit_events').update({ event: 'contract.deleted' }).eq('id', data!.id);
    expect(upd.error?.message).toMatch(/append-only/);
  });

  it('rejects an unknown event name and non-object metadata (CHECK constraints)', async () => {
    const admin = adminClient();
    expect((await admin.from('audit_events').insert({ event: 'something.else', actor_user_id: alice.id })).error?.code).toBe('23514');
    expect((await admin.from('audit_events').insert({ event: 'contract.uploaded', actor_user_id: alice.id, metadata: [] })).error?.code).toBe('23514');
  });
});

describe('service-role-only RPCs', () => {
  it('check_rate_limit is not executable by a signed-in user', async () => {
    const alicedb = await signedInClient(alice);
    const { error } = await alicedb.rpc('check_rate_limit', { p_user_id: alice.id, p_bucket: 'upload', p_limit: 10, p_window_seconds: 3600 });
    // Exact parameter names (typed by database.types.ts), so a "function not found" can't pass as a denial.
    expect(denied(error)).toBe(true);
  });

  it('save_extraction_results is not executable by a signed-in user', async () => {
    const alicedb = await signedInClient(alice);
    const { error } = await alicedb.rpc('save_extraction_results', {
      p_contract_id: contractId, p_user_id: alice.id, p_prompt_version: 'x', p_type_mismatch: false, p_detected_type: 'nda', p_terms: [],
    });
    // Exact parameter names (typed by database.types.ts), so a "function not found" can't pass as a denial.
    expect(denied(error)).toBe(true);
  });
});
