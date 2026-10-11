import '@/lib/server-guard'; // 00 §6.12
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildChatMessages, ChatStreamError, streamChatCompletion, type ChatErrorCode } from '@/lib/ai/chat';
import { parseCitations } from '@/lib/ai/citations';
import { classifyQuery } from '@/lib/ai/classify-query';
import { getChatPrompt } from '@/lib/ai/prompts';
import { logAiUsage } from '@/lib/ai/usage-log';
import { ERROR_CATALOG } from '@/lib/api/error-catalog';
import type { SseSend } from '@/lib/api/sse';
import { MAX_CHAT_HISTORY, NOT_FOUND_ANSWER } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import type { Logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { ChatHistoryResponse } from '@/types/api';
import type { Database } from '@/types/database.types';
import type { ChatMessage, ContractType } from '@/types/domain';

type Client = SupabaseClient<Database>;
const MESSAGE_COLUMNS = 'id, role, content, cited_pages, is_not_found, citation_missing, status, created_at' as const;
const MAX_ASSISTANT_CHARS = 8000; // DB check

/** One session per contract; a concurrent first message (23505) re-reads the winner (09 §6.3). */
export async function getOrCreateChatSession(supabase: Client, userId: string, contractId: string): Promise<string> {
  const find = async () => (await supabase.from('chat_sessions').select('id').eq('contract_id', contractId).maybeSingle()).data?.id;
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await supabase.from('chat_sessions').insert({ contract_id: contractId, user_id: userId }).select('id').single();
  if (data) return data.id;
  if (error?.code === '23505') {
    const winner = await find();
    if (winner) return winner;
  }
  throw error ?? new Error('chat session create failed');
}

/** Newest MAX_CHAT_HISTORY messages, returned ascending (09 §3). */
async function loadHistory(supabase: Client, sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MAX_CHAT_HISTORY);
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function getChatHistory(supabase: Client, contractId: string): Promise<ChatHistoryResponse> {
  const { data: session } = await supabase.from('chat_sessions').select('id').eq('contract_id', contractId).maybeSingle();
  if (!session) return { session_id: null, messages: [] };
  return { session_id: session.id, messages: await loadHistory(supabase, session.id) };
}

const errorMessage = (code: Exclude<ChatErrorCode, 'CLIENT_ABORTED'>) => ERROR_CATALOG[code].message;

/**
 * One grounded answer, streamed over SSE (09 §6.5). The user row is written with the user's client (RLS);
 * the assistant row with the service role, using only ids verified in this request.
 */
export async function streamChatAnswer(args: {
  supabase: Client;
  user: User;
  contract: { id: string; page_count: number | null; contract_type: ContractType; contract_text: string };
  message: string;
  send: SseSend;
  signal: AbortSignal;
  log: Logger;
}): Promise<void> {
  const { supabase, user, contract, message, send, signal, log } = args;
  const admin = createAdminSupabase();

  const sessionId = await getOrCreateChatSession(supabase, user.id, contract.id);
  const queryType = classifyQuery(message);
  const { data: userMsg, error: userErr } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, contract_id: contract.id, user_id: user.id, role: 'user', content: message, query_type: queryType })
    .select('id, created_at')
    .single();
  if (userErr || !userMsg) throw userErr ?? new Error('user message insert failed');
  send('meta', { session_id: sessionId, user_message_id: userMsg.id, query_type: queryType });

  const history = (await loadHistory(supabase, sessionId)).filter(
    (m) => m.id !== userMsg.id && !(m.role === 'assistant' && m.status === 'error'),
  );
  const promptVersion = getChatPrompt(serverEnv.CHAT_PROMPT_VERSION).PROMPT_VERSION;
  const messages = buildChatMessages({
    version: serverEnv.CHAT_PROMPT_VERSION,
    contractType: contract.contract_type,
    contractText: contract.contract_text,
    queryType,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    question: message,
    maxInputTokens: serverEnv.CHAT_MAX_INPUT_TOKENS,
  });

  const started = Date.now();
  const stats = { attempts: 0 };
  let content = '';
  let firstTokenSent = false;
  let usage = { promptTokens: 0, completionTokens: 0 };

  try {
    for await (const chunk of streamChatCompletion({ messages, userId: user.id, signal, stats })) {
      if (chunk.type === 'delta') {
        content += chunk.text;
        send('token', { delta: chunk.text });
        firstTokenSent = true;
      } else {
        usage = chunk.usage;
      }
    }
    const final = (content.trim() || NOT_FOUND_ANSWER).slice(0, MAX_ASSISTANT_CHARS); // empty completion → not found
    const { citedPages, isNotFound, citationMissing } = parseCitations(final, contract.page_count, queryType);
    const { data: assistant, error: insertErr } = await admin
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        contract_id: contract.id,
        user_id: user.id,
        role: 'assistant',
        status: 'complete',
        content: final,
        cited_pages: citedPages,
        is_not_found: isNotFound,
        citation_missing: citationMissing,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
      })
      .select('id')
      .single();
    if (insertErr?.code === '23503') throw new ChatStreamError('NOT_FOUND', stats.attempts); // contract deleted mid-stream
    if (insertErr || !assistant) throw insertErr ?? new Error('assistant insert failed');
    await logAiUsage({
      userId: user.id,
      contractId: contract.id,
      operation: 'chat',
      model: serverEnv.OPENAI_CHAT_MODEL,
      promptVersion,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs: Date.now() - started,
      attempts: Math.max(1, stats.attempts),
      success: true,
    });
    log.info('chat_answered', { query_type: queryType, attempts: stats.attempts, latency_ms: Date.now() - started, cited: citedPages.length, not_found: isNotFound });
    send('done', { message_id: assistant.id, cited_pages: citedPages, is_not_found: isNotFound, citation_missing: citationMissing, content: final });
  } catch (err) {
    const code: ChatErrorCode = err instanceof ChatStreamError ? err.code : 'INTERNAL_ERROR';
    const deleted = code === 'NOT_FOUND'; // nothing can be saved against a deleted contract
    let messageId: string | null = null;
    if (content.length > 0 && !deleted) {
      const partial = parseCitations(content, contract.page_count, queryType);
      const { data } = await admin
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          contract_id: contract.id,
          user_id: user.id,
          role: 'assistant',
          status: 'error',
          content: content.slice(0, MAX_ASSISTANT_CHARS),
          cited_pages: partial.citedPages,
          is_not_found: false,
          citation_missing: false,
          prompt_tokens: usage.promptTokens || null,
          completion_tokens: usage.completionTokens || null,
        })
        .select('id')
        .single();
      messageId = data?.id ?? null;
    }
    await logAiUsage({
      userId: user.id,
      contractId: deleted ? null : contract.id,
      operation: 'chat',
      model: serverEnv.OPENAI_CHAT_MODEL,
      promptVersion,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs: Date.now() - started,
      attempts: Math.max(1, stats.attempts),
      success: false,
      errorCode: code,
    });
    if (err instanceof ChatStreamError && err.upstream) log.error('openai_request_failed', { model: serverEnv.OPENAI_CHAT_MODEL, code, ...err.upstream });
    if (deleted) log.warn('chat_contract_deleted', { attempts: stats.attempts });
    else log.warn('chat_failed', { code, partial: content.length > 0, attempts: stats.attempts, ...(code === 'INTERNAL_ERROR' ? { error: err instanceof Error ? err.message : String(err) } : {}) });
    if (code !== 'CLIENT_ABORTED') {
      send('error', { code, message: errorMessage(code), retryable: !deleted && code !== 'UPSTREAM_REJECTED', message_id: messageId, partial: firstTokenSent });
    }
  }
}
