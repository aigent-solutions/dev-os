import { randomUUID } from 'node:crypto';
import type { Database } from '@/types/database.types';
import type { SeededUser } from '../setup/seed-users';
import { adminClient } from './session';

type Tables = Database['public']['Tables'];
export const PASSWORD = 'Password123';
const BUCKET = 'contracts';

/** A fresh, email-confirmed user (for tests that delete or mutate an account). */
export async function createTestUser(opts: { confirmed?: boolean } = {}): Promise<SeededUser> {
  const email = `t-${randomUUID().slice(0, 8)}@contractiq.test`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: opts.confirmed ?? true });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  return { id: data.user.id, email, password: PASSWORD };
}

export async function deleteTestUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id).catch(() => undefined);
}

/** ≥ 100 words with page markers, so the row satisfies the contracts check constraints. */
export const CONTRACT_TEXT =
  '[PAGE 1]\n' + 'The Receiving Party shall keep all Confidential Information strictly confidential. '.repeat(12) +
  '\n[PAGE 2]\nThis Agreement is governed by the laws of England and Wales.';

export async function seedContract(userId: string, overrides: Partial<Tables['contracts']['Insert']> = {}) {
  const row: Tables['contracts']['Insert'] = {
    user_id: userId,
    file_name: 'Test NDA.pdf',
    file_size_bytes: 20_480,
    contract_type: 'nda',
    status: 'completed',
    contract_text: CONTRACT_TEXT,
    page_count: 2,
    word_count: 120,
    token_count: 200,
    ...overrides,
  };
  const { data, error } = await adminClient().from('contracts').insert(row).select('*').single();
  if (error || !data) throw error ?? new Error('seedContract failed');
  return data;
}

export async function seedKeyTerm(contractId: string, userId: string, overrides: Partial<Tables['key_terms']['Insert']> = {}) {
  const { data, error } = await adminClient()
    .from('key_terms')
    .insert({
      contract_id: contractId,
      user_id: userId,
      term_key: 'governing_law',
      term_name: 'Governing Law',
      value: 'England and Wales',
      page_number: 2,
      confidence_score: 90,
      source_sentence: 'This Agreement is governed by the laws of England and Wales.',
      source_verified: true,
      display_order: 1,
      ...overrides,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('seedKeyTerm failed');
  return data;
}

/** Everything that hangs off a contract, so cascade checks have rows to lose. */
export async function seedContractChildren(contractId: string, userId: string) {
  const admin = adminClient();
  const term = await seedKeyTerm(contractId, userId);
  const custom = await admin.from('custom_key_terms').insert({ contract_id: contractId, user_id: userId, term_name: 'Audit rights' }).select('id').single();
  const session = await admin.from('chat_sessions').insert({ contract_id: contractId, user_id: userId }).select('id').single();
  if (custom.error || session.error) throw custom.error ?? session.error;
  const msg = await admin
    .from('chat_messages')
    .insert({ session_id: session.data.id, contract_id: contractId, user_id: userId, role: 'user', content: 'What is the term?' });
  const fb = await admin.from('user_feedback').insert({ contract_id: contractId, user_id: userId, rating: 'up' });
  const usage = await admin
    .from('ai_usage_logs')
    .insert({ user_id: userId, contract_id: contractId, operation: 'extraction', model: 'gpt-4o', prompt_version: 'extraction-v1.0', prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.001, latency_ms: 10, success: true })
    .select('id')
    .single();
  if (msg.error || fb.error || usage.error) throw msg.error ?? fb.error ?? usage.error;
  return { termId: term.id, sessionId: session.data.id, usageId: usage.data.id };
}

/** A tiny valid-looking PDF at `path` in the contracts bucket (service role). */
export async function uploadObject(path: string): Promise<void> {
  const body = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const { error } = await adminClient().storage.from(BUCKET).upload(path, body, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
}

export const contractPath = (userId: string, contractId: string) => `${userId}/${contractId}/contract.pdf`;
