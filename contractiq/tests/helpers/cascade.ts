import { count } from './db';

// The cascade verification queries from 13-data-lifecycle-gdpr.md §12, run with direct SQL after a delete.
// Each returns a map of check → row count, so a failure names exactly what was left behind.

export async function contractLeftovers(cid: string, uid: string): Promise<Record<string, number>> {
  const q = (table: string, col = 'contract_id') => count(`select count(*) from public.${table} where ${col} = $1`, [cid]);
  return {
    contracts: await q('contracts', 'id'),
    key_terms: await q('key_terms'),
    custom_key_terms: await q('custom_key_terms'),
    chat_sessions: await q('chat_sessions'),
    chat_messages: await q('chat_messages'),
    user_feedback: await q('user_feedback'),
    storage_objects: await count(`select count(*) from storage.objects where bucket_id = 'contracts' and name like $1`, [`${uid}/${cid}/%`]),
    ai_usage_logs_linked: await q('ai_usage_logs'),
  };
}

/** ai_usage_logs rows are KEPT on contract delete, with contract_id set to null. */
export const usageRowsDetached = (ids: number[]) =>
  count('select count(*) from public.ai_usage_logs where id = any($1::bigint[]) and contract_id is null', [ids]);

export async function accountLeftovers(uid: string): Promise<Record<string, number>> {
  const q = (table: string, col = 'user_id') => count(`select count(*) from public.${table} where ${col} = $1`, [uid]);
  return {
    auth_users: await count('select count(*) from auth.users where id = $1', [uid]),
    profiles: await q('profiles', 'id'),
    contracts: await q('contracts'),
    custom_key_terms: await q('custom_key_terms'),
    key_terms: await q('key_terms'),
    chat_sessions: await q('chat_sessions'),
    chat_messages: await q('chat_messages'),
    user_feedback: await q('user_feedback'),
    ai_usage_logs: await q('ai_usage_logs'),
    rate_limits: await q('rate_limits'),
    storage_objects: await count(`select count(*) from storage.objects where bucket_id = 'contracts' and name like $1`, [`${uid}/%`]),
  };
}

export const allZero = (o: Record<string, number>) => Object.fromEntries(Object.keys(o).map((k) => [k, 0]));
