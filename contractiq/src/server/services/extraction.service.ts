import '@/lib/server-guard'; // loaded by the background Netlify function (00 §6.12)
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildExtractionResponseFormat } from '@/lib/ai/extraction-schema';
import { callExtractionModel, ExtractionError } from '@/lib/ai/extraction';
import { postProcessTerms } from '@/lib/ai/post-process-terms';
import { getExtractionPrompt } from '@/lib/ai/prompts';
import { buildRequestedTerms } from '@/lib/ai/term-library';
import { logAiUsage } from '@/lib/ai/usage-log';
import { CONTRACT_ERROR_MESSAGE, type ContractErrorCode } from '@/lib/api/error-catalog';
import { appError } from '@/lib/api/errors';
import { internalAuthHeaders } from '@/lib/api/internal-auth';
import { DISPATCH_TIMEOUT_MS, MAX_PROCESSING_ATTEMPTS } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { logger, type Logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { makeCustomTermsSchema } from '@/lib/validation/custom-terms';
import type { Database } from '@/types/database.types';
import { applyProcessingTimeout } from './contracts.service';

type Client = SupabaseClient<Database>;

// =============================================================================================
// startProcessing — POST /api/contracts/{id}/process (05 §6.1, engineering-doc §6.6)
// =============================================================================================
export type ProcessResult =
  | {
      httpStatus: 202;
      body: { contract_id: string; status: 'processing'; processing_stage: 'analysing'; mode: 'background' };
    }
  | {
      httpStatus: 200;
      body: {
        contract_id: string;
        status: 'completed' | 'error';
        mode: 'sync';
        error: { code: string; message: string; retryable: true } | null;
      };
    };

export async function startProcessing(args: {
  supabase: Client;
  user: User;
  contractId: string;
  customTerms: string[];
  requestId: string;
  requestStartedAt: number;
  log: Logger;
}): Promise<ProcessResult> {
  const { supabase, user, contractId, requestId, log } = args;

  // 1. Load (user client: RLS proves ownership).
  const { data: loaded, error: loadError } = await supabase
    .from('contracts')
    .select('id, user_id, contract_type, status, processing_attempts, processing_started_at, error_code, error_message')
    .eq('id', contractId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!loaded) throw appError('NOT_FOUND');
  let contract = loaded;

  // 2. A stale 'processing' row is timed out first; a fresh one is a conflict.
  if (contract.status === 'processing') {
    const timedOut = await applyProcessingTimeout(contract, log);
    if (!timedOut) throw appError('ALREADY_PROCESSING');
    contract = { ...contract, ...timedOut };
  }

  // 3. Status and attempts.
  if (contract.status !== 'ready' && contract.status !== 'error') throw appError('INVALID_STATUS');
  if (contract.processing_attempts >= MAX_PROCESSING_ATTEMPTS) throw appError('MAX_ATTEMPTS');

  // 4. Custom terms against this contract type.
  const parsed = makeCustomTermsSchema(contract.contract_type).safeParse(args.customTerms);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) details[['custom_terms', ...issue.path].join('.')] ??= issue.message;
    throw appError('VALIDATION_ERROR', details);
  }
  const customTerms = parsed.data;

  // 5. Claim: compare-and-set on status AND processing_attempts gives an atomic increment (admin).
  const admin = createAdminSupabase();
  const n = contract.processing_attempts;
  const prev = {
    status: contract.status,
    processing_started_at: contract.processing_started_at,
    processing_attempts: n,
    error_code: contract.error_code,
    error_message: contract.error_message,
  };
  const { data: claimed, error: claimError } = await admin
    .from('contracts')
    .update({
      status: 'processing',
      processing_stage: 'analysing',
      processing_started_at: new Date().toISOString(),
      processing_completed_at: null,
      processing_attempts: n + 1,
      error_code: null,
      error_message: null,
    })
    .eq('id', contractId)
    .eq('user_id', user.id)
    .in('status', ['ready', 'error'])
    .eq('processing_attempts', n)
    .lt('processing_attempts', MAX_PROCESSING_ATTEMPTS)
    .select('id')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: now } = await supabase.from('contracts').select('status').eq('id', contractId).maybeSingle();
    throw appError(now?.status === 'processing' ? 'ALREADY_PROCESSING' : 'INVALID_STATUS');
  }

  const rollbackClaim = async () => {
    const { error } = await admin
      .from('contracts')
      .update({
        status: prev.status,
        processing_stage: null,
        processing_started_at: prev.processing_started_at,
        processing_attempts: prev.processing_attempts,
        error_code: prev.error_code,
        error_message: prev.error_message,
      })
      .eq('id', contractId)
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .eq('processing_attempts', n + 1);
    if (error) log.error('process_rollback_failed', { contract_id: contractId, error: error.message });
  };

  // 6. Persist custom terms (user client; DELETE + one INSERT per term, in order — 04 §3).
  try {
    const { error: delError } = await supabase.from('custom_key_terms').delete().eq('contract_id', contractId);
    if (delError) throw delError;
    for (const term_name of customTerms) {
      const { error } = await supabase.from('custom_key_terms').insert({ contract_id: contractId, user_id: user.id, term_name });
      if (error) throw error;
    }
  } catch (err) {
    await rollbackClaim();
    const code = (err as { code?: string }).code;
    if (code === '23514' || code === '23505') {
      throw appError('VALIDATION_ERROR', { custom_terms: 'Custom terms must be unique, and at most 5.' });
    }
    throw err;
  }

  // 7. Mode.
  const runSync = async (): Promise<ProcessResult> => {
    const r = await runExtraction(contractId, user.id, {
      deadlineAt: args.requestStartedAt + serverEnv.SYNC_PROCESSING_BUDGET_MS,
      requestId,
      log,
    });
    if (r.status === 'skipped') {
      // After a successful claim this only happens when the contract was deleted mid-run (13 §10).
      return {
        httpStatus: 200,
        body: { contract_id: contractId, status: 'error', mode: 'sync', error: { code: 'INTERNAL_ERROR', message: CONTRACT_ERROR_MESSAGE, retryable: true } },
      };
    }
    return {
      httpStatus: 200,
      body: {
        contract_id: contractId,
        status: r.status,
        mode: 'sync',
        error: r.status === 'error' ? { code: r.error.code, message: r.error.message, retryable: true } : null,
      },
    };
  };

  if (serverEnv.PROCESSING_MODE === 'sync') return runSync();

  const dispatch = await dispatchBackground({ contractId, userId: user.id, requestId });
  if (dispatch.ok) {
    return {
      httpStatus: 202,
      body: { contract_id: contractId, status: 'processing', processing_stage: 'analysing', mode: 'background' },
    };
  }
  if (serverEnv.PROCESSING_SYNC_FALLBACK) {
    log.warn('PROCESSING_FALLBACK_SYNC', {
      contract_id: contractId,
      dispatch_status: dispatch.status ?? null,
      dispatch_error: dispatch.error ?? null,
    });
    return runSync();
  }
  await rollbackClaim();
  throw appError('JOB_DISPATCH_FAILED');
}

/** Any non-202, a network error, or no response within 3 s is a dispatch failure. */
async function dispatchBackground(p: {
  contractId: string;
  userId: string;
  requestId: string;
}): Promise<{ ok: true } | { ok: false; status?: number; error?: string }> {
  try {
    const res = await fetch(`${serverEnv.SITE_URL}/.netlify/functions/process-contract-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ contract_id: p.contractId, user_id: p.userId, request_id: p.requestId }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    return res.status === 202 ? { ok: true } : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'TimeoutError' ? 'timeout' : String((e as Error).message) };
  }
}

// =============================================================================================
// runExtraction — shared by the background function and sync mode (05 §6.2). Never throws.
// =============================================================================================
export type ExtractionOutcome =
  | { status: 'completed' }
  | { status: 'skipped' } // contract was not 'processing' (double invoke or already timed out); no writes
  | { status: 'error'; error: { code: ContractErrorCode; message: string } };

export async function runExtraction(
  contractId: string,
  userId: string,
  opts: { deadlineAt?: number; requestId?: string; log?: Logger } = {},
): Promise<ExtractionOutcome> {
  const admin = createAdminSupabase();
  const log = opts.log ?? logger.child({ contract_id: contractId, user_id: userId });
  const t0 = Date.now();
  const mode = opts.deadlineAt ? 'sync' : 'background';
  let modelCalled = false;
  let promptVersion = serverEnv.EXTRACTION_PROMPT_VERSION as string;

  try {
    // 1. Load (admin), only while processing.
    const { data: contract, error: loadError } = await admin
      .from('contracts')
      .select('id, user_id, contract_type, status, contract_text, page_count')
      .eq('id', contractId)
      .eq('user_id', userId)
      .eq('status', 'processing')
      .maybeSingle();
    if (loadError) throw loadError;
    if (!contract || !contract.contract_text || !contract.page_count) {
      log.warn('extraction_skipped_not_processing', { contract_id: contractId, mode });
      return { status: 'skipped' };
    }

    // 2. Requested terms: standard + custom in the user's order.
    const { data: customRows, error: customError } = await admin
      .from('custom_key_terms')
      .select('id, term_name')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (customError) throw customError;
    const requested = buildRequestedTerms(contract.contract_type, customRows ?? []);

    // 3–4. Prompt and model call.
    const prompt = getExtractionPrompt(serverEnv.EXTRACTION_PROMPT_VERSION);
    promptVersion = prompt.PROMPT_VERSION;
    const messages = prompt.buildMessages({ contractType: contract.contract_type, terms: requested, contractText: contract.contract_text });
    modelCalled = true;
    const call = await callExtractionModel({
      messages,
      responseFormat: buildExtractionResponseFormat(requested.map((t) => t.key)),
      userId,
      deadlineAt: opts.deadlineAt,
      log,
    });

    // 5. Stage → compiling.
    await admin
      .from('contracts')
      .update({ processing_stage: 'compiling' })
      .eq('id', contractId)
      .eq('user_id', userId)
      .eq('status', 'processing');

    // 6–7. Guardrails and type detection ('other' always counts as a mismatch).
    const terms = postProcessTerms({
      requested,
      modelTerms: call.result.terms,
      contractText: contract.contract_text,
      pageCount: contract.page_count,
    });
    const detected = call.result.detected_contract_type;

    // 8. Transactional save. P0002 → the lazy timeout won the race; discard.
    const { error: saveError } = await admin.rpc('save_extraction_results', {
      p_contract_id: contractId,
      p_user_id: userId,
      p_detected_type: detected,
      p_type_mismatch: detected !== contract.contract_type,
      p_prompt_version: prompt.PROMPT_VERSION,
      p_terms: terms,
    });

    // 9. Usage (the model was called either way).
    await logAiUsage({
      userId,
      contractId,
      operation: 'extraction',
      model: call.model,
      promptVersion: prompt.PROMPT_VERSION,
      promptTokens: call.usage.promptTokens,
      completionTokens: call.usage.completionTokens,
      latencyMs: call.latencyMs,
      attempts: call.attempts,
      success: !saveError,
      errorCode: saveError ? 'PROCESSING_TIMEOUT' : null,
    });
    if (call.repairUsage) {
      await logAiUsage({
        userId,
        contractId,
        operation: 'extraction_repair',
        model: call.model,
        promptVersion: prompt.PROMPT_VERSION,
        promptTokens: call.repairUsage.promptTokens,
        completionTokens: call.repairUsage.completionTokens,
        latencyMs: call.latencyMs,
        attempts: 1,
        success: true,
      });
    }

    if (saveError) {
      if (saveError.code === 'P0002') {
        // No processing row: either deleted by the user mid-run (13 §10: stop, no retry) or the lazy timeout won.
        const { data: still } = await admin.from('contracts').select('id').eq('id', contractId).maybeSingle();
        if (!still) {
          log.info('extraction_contract_deleted', { contract_id: contractId, mode });
          return { status: 'skipped' };
        }
        log.warn('extraction_result_discarded', { contract_id: contractId, mode });
        return { status: 'error', error: { code: 'PROCESSING_TIMEOUT', message: CONTRACT_ERROR_MESSAGE } };
      }
      throw saveError;
    }

    // 10.
    log.info('extraction_completed', {
      contract_id: contractId,
      mode,
      duration_ms: Date.now() - t0,
      terms: terms.length,
      low_confidence: terms.filter((t) => t.confidence_score < 50).length,
      attempts: call.attempts,
      repaired: !!call.repairUsage,
    });
    return { status: 'completed' };
  } catch (err) {
    const code: ContractErrorCode = err instanceof ExtractionError ? err.code : 'INTERNAL_ERROR';
    await admin
      .from('contracts')
      .update({ status: 'error', processing_stage: null, error_code: code, error_message: CONTRACT_ERROR_MESSAGE })
      .eq('id', contractId)
      .eq('user_id', userId)
      .eq('status', 'processing');
    if (modelCalled) {
      await logAiUsage({
        userId,
        contractId,
        operation: 'extraction',
        model: serverEnv.OPENAI_EXTRACTION_MODEL,
        promptVersion,
        promptTokens: err instanceof ExtractionError ? (err.usage?.promptTokens ?? 0) : 0,
        completionTokens: err instanceof ExtractionError ? (err.usage?.completionTokens ?? 0) : 0,
        latencyMs: Date.now() - t0,
        attempts: err instanceof ExtractionError ? Math.max(1, err.attempts) : 1,
        success: false,
        errorCode: code,
      });
    }
    log.error('extraction_failed', {
      contract_id: contractId,
      mode,
      code,
      ...(err instanceof ExtractionError ? {} : { error: err instanceof Error ? err.message : String(err) }),
    });
    return { status: 'error', error: { code, message: CONTRACT_ERROR_MESSAGE } };
  }
}
