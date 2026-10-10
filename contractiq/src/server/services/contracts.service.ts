import '@/lib/server-guard'; // loaded by Netlify functions (00 §6.12)
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { countTokens } from '@/lib/ai/token-count';
import { CONTRACT_ERROR_MESSAGE } from '@/lib/api/error-catalog';
import { AppError, appError } from '@/lib/api/errors';
import {
  CONFIDENCE_LOW,
  MAX_CONTRACT_TOKENS,
  MAX_FILE_BYTES,
  MIN_WORDS,
  PROCESSING_TIMEOUT_MS,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_BUCKET,
} from '@/lib/constants';
import type { Logger } from '@/lib/logger';
import { extractPdfText } from '@/lib/pdf/extract-text';
import { assertPdfBuffer } from '@/lib/pdf/validate-pdf';
import { isContractPath } from '@/lib/storage-paths';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { safeFileName } from '@/lib/utils';
import type { ContractUpdateInput, ListContractsQuery } from '@/lib/validation/contract';
import type { ContractDetail, ContractUpdateResponse, ListContractsResponse } from '@/types/api';
import type { Database } from '@/types/database.types';
import type { ContractStatus, ContractType, ProcessingStage } from '@/types/domain';

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------------------------
// Create (03 §6.1) — user-scoped insert; the guard trigger enforces an empty pending_upload row.
// ---------------------------------------------------------------------------------------------
export async function createContract(
  supabase: Client,
  user: User,
  input: { file_name: string; file_size: number; contract_type: ContractType },
): Promise<{ contract_id: string; storage_bucket: typeof STORAGE_BUCKET; storage_path: string }> {
  if (input.file_size > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  const contractId = crypto.randomUUID();
  const storagePath = `${user.id}/${contractId}/${safeFileName(input.file_name)}`;
  const { error } = await supabase.from('contracts').insert({
    id: contractId,
    user_id: user.id,
    file_name: input.file_name,
    file_path: storagePath,
    file_size_bytes: input.file_size,
    contract_type: input.contract_type,
  });
  if (error) throw error; // unexpected → 500
  return { contract_id: contractId, storage_bucket: STORAGE_BUCKET, storage_path: storagePath };
}

// ---------------------------------------------------------------------------------------------
// Extract (03 §6.2) — download once (admin), parse, enforce limits, persist (admin).
// Every 413/422 deletes the object and the row before rethrowing (no partial output).
// ---------------------------------------------------------------------------------------------
export type ExtractResponse = {
  contract_id: string;
  status: 'ready';
  page_count: number;
  word_count: number;
  token_count: number;
};

export async function extractContractText(
  supabase: Client,
  user: User,
  contractId: string,
  log: Logger,
): Promise<ExtractResponse> {
  const started = Date.now();
  const { data: contract, error: loadError } = await supabase
    .from('contracts')
    .select('id, user_id, status, file_path, file_size_bytes')
    .eq('id', contractId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!contract) throw appError('NOT_FOUND');
  if (contract.status !== 'pending_upload') throw appError('INVALID_STATUS');

  const filePath = contract.file_path;
  if (!filePath || !isContractPath(filePath, user.id, contractId)) {
    log.error('file_path_prefix_mismatch', { contract_id: contractId });
    throw appError('INTERNAL_ERROR');
  }

  const admin = createAdminSupabase();
  const cleanup = async () => {
    const { error: rmError } = await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (rmError) log.warn('extract_cleanup_storage_failed', { contract_id: contractId, error: rmError.message });
    const { error: delError } = await supabase.from('contracts').delete().eq('id', contractId);
    if (delError) log.warn('extract_cleanup_row_failed', { contract_id: contractId, error: delError.message });
  };

  let text: string;
  let pageCount: number;
  let wordCount: number;
  let tokenCount: number;
  try {
    let blob: Blob;
    try {
      const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(filePath);
      if (error) {
        const status = (error as { statusCode?: string; status?: number }).statusCode ?? (error as { status?: number }).status;
        if (String(status) === '404' || /not found/i.test(error.message)) {
          log.warn('extract_object_missing', { contract_id: contractId }); // upload never finished
          throw appError('PDF_UNREADABLE');
        }
        throw appError('STORAGE_UNAVAILABLE');
      }
      blob = data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw appError('STORAGE_UNAVAILABLE');
    }

    const buf = Buffer.from(await blob.arrayBuffer());
    assertPdfBuffer(buf);
    ({ text, pageCount, wordCount } = await extractPdfText(buf));
    if (wordCount < MIN_WORDS) throw appError('SCANNED_PDF', { word_count: wordCount });
    tokenCount = countTokens(text);
    if (tokenCount > MAX_CONTRACT_TOKENS) throw appError('CONTRACT_TOO_LONG', { token_count: tokenCount });
  } catch (err) {
    if (err instanceof AppError && (err.status === 413 || err.status === 422)) {
      await cleanup();
      const cause = err.cause instanceof Error ? { cause_name: err.cause.name, cause_message: err.cause.message.slice(0, 200) } : {};
      log.info('contract_extract_rejected', { contract_id: contractId, code: err.code, ...cause });
    }
    throw err;
  }

  const { data: updated, error: updateError } = await admin
    .from('contracts')
    .update({ contract_text: text, page_count: pageCount, word_count: wordCount, token_count: tokenCount, status: 'ready' })
    .eq('id', contractId)
    .eq('user_id', user.id)
    .eq('status', 'pending_upload')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw appError('INVALID_STATUS'); // a concurrent request already moved the row on

  log.info('contract_extracted', {
    contract_id: contractId,
    page_count: pageCount,
    word_count: wordCount,
    token_count: tokenCount,
    duration_ms: Date.now() - started,
  });
  return { contract_id: contractId, status: 'ready', page_count: pageCount, word_count: wordCount, token_count: tokenCount };
}

// ---------------------------------------------------------------------------------------------
// Delete (13 §6.3) — user client throughout, so Storage RLS applies to the object removal.
// ---------------------------------------------------------------------------------------------
export async function deleteContract(supabase: Client, userId: string, contractId: string, log: Logger): Promise<void> {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, user_id, file_path')
    .eq('id', contractId)
    .maybeSingle();
  if (error) throw appError('INTERNAL_ERROR');
  if (!contract) throw appError('NOT_FOUND');

  if (contract.file_path) {
    if (!isContractPath(contract.file_path, userId, contractId)) {
      log.warn('contract_delete_path_mismatch', { contract_id: contractId }); // skip storage, still delete row
    } else {
      const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([contract.file_path]);
      if (rmErr) log.warn('contract_delete_storage_failed', { contract_id: contractId, error: rmErr.message });
    }
  }

  const { error: delErr, count } = await supabase.from('contracts').delete({ count: 'exact' }).eq('id', contractId);
  if (delErr) throw appError('INTERNAL_ERROR');
  if (count === 0) throw appError('NOT_FOUND'); // deleted concurrently
  log.info('contract_deleted', { contract_id: contractId });
}

// ---------------------------------------------------------------------------------------------
// Lazy processing timeout (05 §6.9) and the status read (05 §5.2).
// ---------------------------------------------------------------------------------------------
export async function applyProcessingTimeout(
  c: { id: string; user_id: string; status: ContractStatus; processing_started_at: string | null },
  log: Logger,
): Promise<{ status: 'error'; error_code: 'PROCESSING_TIMEOUT'; error_message: string } | null> {
  if (c.status !== 'processing' || !c.processing_started_at) return null;
  if (Date.now() - Date.parse(c.processing_started_at) <= PROCESSING_TIMEOUT_MS) return null;

  const { data } = await createAdminSupabase()
    .from('contracts')
    .update({
      status: 'error',
      processing_stage: null,
      error_code: 'PROCESSING_TIMEOUT',
      error_message: CONTRACT_ERROR_MESSAGE,
    })
    .eq('id', c.id)
    .eq('user_id', c.user_id)
    .eq('status', 'processing')
    .eq('processing_started_at', c.processing_started_at)
    .select('id')
    .maybeSingle();
  if (!data) return null; // the run finished or was already timed out; caller re-reads
  log.warn('PROCESSING_TIMEOUT', { contract_id: c.id });
  return { status: 'error', error_code: 'PROCESSING_TIMEOUT', error_message: CONTRACT_ERROR_MESSAGE };
}

export type StatusResponse = {
  status: ContractStatus;
  processing_stage: ProcessingStage | null;
  error: { code: string; message: string } | null;
  elapsed_ms: number | null;
};

const STATUS_COLUMNS =
  'id, user_id, status, processing_stage, error_code, error_message, processing_started_at, processing_completed_at';

export async function getContractStatus(supabase: Client, contractId: string, log: Logger): Promise<StatusResponse> {
  const load = () => supabase.from('contracts').select(STATUS_COLUMNS).eq('id', contractId).maybeSingle();
  let { data: c } = await load();
  if (!c) throw appError('NOT_FOUND');

  if (c.status === 'processing') {
    const timedOut = await applyProcessingTimeout(c, log);
    if (timedOut) c = { ...c, ...timedOut, processing_stage: null };
    else if (Date.now() - Date.parse(c.processing_started_at ?? '') > PROCESSING_TIMEOUT_MS) {
      ({ data: c } = await load()); // lost the race to another writer: use the fresh row
      if (!c) throw appError('NOT_FOUND');
    }
  }

  const started = c.processing_started_at ? Date.parse(c.processing_started_at) : null;
  const elapsed =
    started === null
      ? null
      : c.status === 'processing'
        ? Date.now() - started
        : c.status === 'completed' && c.processing_completed_at
          ? Date.parse(c.processing_completed_at) - started
          : null;

  return {
    status: c.status,
    processing_stage: c.status === 'processing' ? c.processing_stage : null,
    error: c.status === 'error' && c.error_code ? { code: c.error_code, message: c.error_message ?? CONTRACT_ERROR_MESSAGE } : null,
    elapsed_ms: elapsed,
  };
}

// ---------------------------------------------------------------------------------------------
// Detail (06 §6.1) — user client throughout (RLS), except the lazy timeout. Never returns
// file_path or user_id. Signing failures degrade to pdf_url: null (the text viewer still works).
// ---------------------------------------------------------------------------------------------
const DETAIL_COLUMNS =
  'id, user_id, file_name, file_path, contract_type, detected_contract_type, type_mismatch, status, processing_stage, ' +
  'processing_started_at, processing_attempts, page_count, contract_text, error_code, error_message, created_at, ' +
  'review_completed_at, prompt_version';

// One literal (not concatenated) so supabase-js can infer the row type.
const KEY_TERM_COLUMNS =
  'id, term_key, term_name, is_custom, value, page_number, confidence_score, source_sentence, source_verified, is_edited, original_value, original_page_number, edited_at, display_order' as const;

type DetailRow = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string | null;
  contract_type: ContractType;
  detected_contract_type: ContractDetail['contract']['detected_contract_type'];
  type_mismatch: boolean;
  status: ContractStatus;
  processing_stage: ProcessingStage | null;
  processing_started_at: string | null;
  processing_attempts: number;
  page_count: number | null;
  contract_text: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  review_completed_at: string | null;
  prompt_version: string | null;
};

export async function getContractDetail(
  supabase: Client,
  userId: string,
  contractId: string,
  log: Logger,
): Promise<ContractDetail | null> {
  const { data, error } = await supabase.from('contracts').select(DETAIL_COLUMNS).eq('id', contractId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let row = data as unknown as DetailRow;

  // 2. Lazy timeout (admin, after the user-scoped load proved ownership).
  if (row.status === 'processing') {
    const timedOut = await applyProcessingTimeout(row, log);
    if (timedOut) row = { ...row, ...timedOut, processing_stage: null };
  }

  // 3. Touch access time (drives the 90-day PDF retention). Not fatal.
  const { error: touchError } = await supabase
    .from('contracts')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', contractId);
  if (touchError) log.warn('TOUCH_FAILED', { contract_id: contractId, error: touchError.message });

  const customQuery = supabase
    .from('custom_key_terms')
    .select('id, term_name')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  let keyTerms: ContractDetail['key_terms'] = [];
  let feedback: ContractDetail['feedback'] = null;
  let pdfUrl: string | null = null;
  let pdfUrlExpiresAt: string | null = null;
  let customTerms: ContractDetail['custom_terms'] = [];

  if (row.status === 'completed') {
    // Computed before signing, so the client's refresh estimate is never late.
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
    const sign = async (): Promise<string | null> => {
      if (!row.file_path) return null; // PDF deleted after 90 days → text viewer
      if (!isContractPath(row.file_path, userId, contractId)) {
        log.error('FILE_PATH_MISMATCH', { contract_id: contractId });
        return null;
      }
      const { data: signed, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) {
        log.warn('SIGNED_URL_FAILED', { contract_id: contractId, storage_error: signError?.message ?? 'no data' });
        return null;
      }
      return signed.signedUrl;
    };
    const [termsRes, customRes, feedbackRes, url] = await Promise.all([
      supabase.from('key_terms').select(KEY_TERM_COLUMNS).eq('contract_id', contractId).order('display_order', { ascending: true }),
      customQuery,
      supabase.from('user_feedback').select('rating, comment, accuracy_rating').eq('contract_id', contractId).maybeSingle(),
      sign(),
    ]);
    if (termsRes.error) throw termsRes.error;
    if (customRes.error) throw customRes.error;
    keyTerms = termsRes.data ?? [];
    customTerms = customRes.data ?? [];
    feedback = feedbackRes.data ?? null;
    pdfUrl = url;
    pdfUrlExpiresAt = url ? expiresAt : null;
  } else {
    const customRes = await customQuery;
    if (customRes.error) throw customRes.error;
    customTerms = customRes.data ?? [];
  }

  return {
    contract: {
      id: row.id,
      file_name: row.file_name,
      contract_type: row.contract_type,
      detected_contract_type: row.detected_contract_type,
      type_mismatch: row.type_mismatch,
      status: row.status,
      processing_stage: row.status === 'processing' ? row.processing_stage : null,
      page_count: row.page_count,
      created_at: row.created_at,
      review_completed_at: row.review_completed_at,
      prompt_version: row.prompt_version,
      processing_attempts: row.processing_attempts,
      contract_text: row.status === 'pending_upload' ? null : row.contract_text,
      error:
        row.status === 'error'
          ? { code: row.error_code ?? 'INTERNAL_ERROR', message: row.error_message ?? CONTRACT_ERROR_MESSAGE }
          : null,
    },
    pdf_url: pdfUrl,
    pdf_url_expires_at: pdfUrlExpiresAt,
    key_terms: keyTerms,
    custom_terms: customTerms,
    feedback,
  };
}

// ---------------------------------------------------------------------------------------------
// Update (06 §5.2, §6.1) — review complete / undo / rename. The first review timestamp is kept:
// it is the North Star end marker.
// ---------------------------------------------------------------------------------------------
export async function updateContract(
  supabase: Client,
  contractId: string,
  input: ContractUpdateInput,
): Promise<ContractUpdateResponse> {
  const { data: current, error } = await supabase
    .from('contracts')
    .select('id, status, file_name, review_completed_at')
    .eq('id', contractId)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw appError('NOT_FOUND');

  if (input.review_completed === true && current.status !== 'completed') throw appError('INVALID_STATUS');
  if (input.file_name !== undefined && current.status === 'pending_upload') throw appError('INVALID_STATUS');

  const patch: { review_completed_at?: string | null; file_name?: string } = {};
  if (input.review_completed === true && !current.review_completed_at) patch.review_completed_at = new Date().toISOString();
  if (input.review_completed === false) patch.review_completed_at = null;
  if (input.file_name !== undefined) patch.file_name = input.file_name;

  if (Object.keys(patch).length === 0) {
    return { id: current.id, file_name: current.file_name, review_completed_at: current.review_completed_at };
  }
  const { data: updated, error: updateError } = await supabase
    .from('contracts')
    .update(patch)
    .eq('id', contractId)
    .select('id, file_name, review_completed_at')
    .single();
  if (updateError) throw updateError;
  return updated;
}

// ---------------------------------------------------------------------------------------------
// List (10 §6.3) — user client (RLS). contract_text is never selected.
// ---------------------------------------------------------------------------------------------
export async function listContracts(supabase: Client, q: ListContractsQuery): Promise<ListContractsResponse> {
  const visible = (columns: string, head = false) => {
    const query = supabase.from('contracts').select(columns, { count: 'exact', head }).neq('status', 'pending_upload');
    return q.type ? query.eq('contract_type', q.type) : query;
  };
  const from = (q.page - 1) * q.page_size;
  const { data, count, error } = await visible('id, file_name, contract_type, status, page_count, created_at, review_completed_at')
    .order(q.sort, { ascending: q.order === 'asc' })
    .order('id', { ascending: true }) // stable tiebreak
    .range(from, from + q.page_size - 1)
    .returns<Omit<ListContractsResponse['items'][number], 'low_confidence_count'>[]>();

  // A page past the end: PostgREST answers 416 (PGRST103). Return no items with the real total (10 §5.2).
  if (error?.code === 'PGRST103') {
    const { count: total, error: countError } = await visible('id', true);
    if (countError) throw appError('INTERNAL_ERROR');
    return { items: [], page: q.page, page_size: q.page_size, total: total ?? 0 };
  }
  if (error) throw appError('INTERNAL_ERROR');

  // Low-confidence counts for this page only: ≤ 50 contracts × 17 terms, under PostgREST's 1,000-row cap.
  const lowByContract = new Map<string, number>();
  const ids = data.map((r) => r.id);
  if (ids.length > 0) {
    const { data: low, error: lowError } = await supabase
      .from('key_terms')
      .select('contract_id')
      .in('contract_id', ids)
      .lt('confidence_score', CONFIDENCE_LOW);
    if (lowError) throw appError('INTERNAL_ERROR');
    for (const t of low) lowByContract.set(t.contract_id, (lowByContract.get(t.contract_id) ?? 0) + 1);
  }

  return {
    items: data.map((r) => ({ ...r, low_confidence_count: lowByContract.get(r.id) ?? 0 })),
    page: q.page,
    page_size: q.page_size,
    total: count ?? 0,
  };
}
