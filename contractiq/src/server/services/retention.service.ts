import '@/lib/server-guard'; // loaded by the retention-cleanup Netlify function
import { AUDIT_RETENTION_DAYS, PDF_RETENTION_DAYS, PENDING_UPLOAD_TTL_HOURS, STORAGE_BUCKET } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { chunk, isContractPath } from '@/lib/storage-paths';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { listStorageEntries } from './account.service';
import { runCorrectionRateCheck, runCostBudgetCheck } from './usage.service';

export type RetentionSummary = {
  expiredPdfs: { removed: number; skippedPathMismatch: number; failed: number };
  pendingSweep: { rowsDeleted: number; objectsRemoved: number };
  orphanSweep: { foldersScanned: number; objectsRemoved: number; truncated: boolean };
  rateLimitsPruned: number;
  auditEventsPruned: number;
  costCheck: 'ok' | 'warning' | 'failed';
  correctionRateCheck: 'ok' | 'warning' | 'failed';
  durationMs: number;
};

const BATCH = 100;
const MAX_BATCHES_PER_STEP = 50; // ≤ 5,000 rows per step per run
const MAX_ORPHAN_USER_FOLDERS = 1000; // bounded scan; truncated = true if more
const ORPHAN_MIN_AGE_MS = 24 * 3_600_000; // an object with no row yet may be an upload in flight
const RATE_LIMIT_KEEP_MS = 2 * 86_400_000; // longest window is 24 h
const NEAR_TIMEOUT_MS = 25_000; // scheduled functions stop at 30 s
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof createAdminSupabase>;

/**
 * Daily data lifecycle (13 §6.5). Each step has its own try/catch so one failure never skips the next;
 * every step is idempotent, and whatever a capped run leaves over is handled the next day.
 */
export async function runRetention(now = new Date()): Promise<RetentionSummary> {
  const started = Date.now();
  const admin = createAdminSupabase();
  const summary: RetentionSummary = {
    expiredPdfs: { removed: 0, skippedPathMismatch: 0, failed: 0 },
    pendingSweep: { rowsDeleted: 0, objectsRemoved: 0 },
    orphanSweep: { foldersScanned: 0, objectsRemoved: 0, truncated: false },
    rateLimitsPruned: 0,
    auditEventsPruned: 0,
    costCheck: 'failed',
    correctionRateCheck: 'failed',
    durationMs: 0,
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      logger.error('retention_step_failed', { step: name, error: err instanceof Error ? err.message : String(err) });
    }
  };

  await step('expired_pdfs', () => expirePdfs(admin, now, summary.expiredPdfs));
  await step('pending_sweep', () => sweepPending(admin, now, summary.pendingSweep));
  await step('orphan_sweep', () => sweepOrphans(admin, now, summary.orphanSweep));
  await step('rate_limits', async () => {
    const { error, count } = await admin
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('window_start', new Date(now.getTime() - RATE_LIMIT_KEEP_MS).toISOString());
    if (error) throw error;
    summary.rateLimitsPruned = count ?? 0;
  });
  await step('audit_events', async () => {
    const { error, count } = await admin
      .from('audit_events')
      .delete({ count: 'exact' })
      .lt('occurred_at', new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000).toISOString());
    if (error) throw error;
    summary.auditEventsPruned = count ?? 0;
  });
  await step('cost_check', async () => {
    summary.costCheck = await runCostBudgetCheck(now);
  });
  await step('correction_rate_check', async () => {
    summary.correctionRateCheck = await runCorrectionRateCheck();
  });

  summary.durationMs = Date.now() - started;
  if (summary.durationMs > NEAR_TIMEOUT_MS) logger.warn('retention_near_timeout', { duration_ms: summary.durationMs });
  return summary;
}

/** Step 1: PDFs 90 days after last access. Rows (and contract_text) stay; only the file and its pointer go. */
async function expirePdfs(admin: Admin, now: Date, out: RetentionSummary['expiredPdfs']) {
  const cutoff = new Date(now.getTime() - PDF_RETENTION_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  for (let i = 0; i < MAX_BATCHES_PER_STEP; i++) {
    const { data: rows, error } = await admin
      .from('contracts')
      .select('id, user_id, file_path')
      .not('file_path', 'is', null)
      .lt('last_accessed_at', cutoff)
      .order('last_accessed_at')
      .limit(BATCH);
    if (error) throw error;
    if (rows.length === 0) break;

    const valid = rows.filter((r) => isContractPath(r.file_path!, r.user_id, r.id));
    const invalid = rows.filter((r) => !valid.includes(r));
    // Never call Storage with an unexpected path; clearing the pointer stops it being re-selected.
    for (const r of invalid) logger.warn('retention_path_mismatch', { contract_id: r.id });

    if (valid.length) {
      const { error: rmErr } = await admin.storage.from(STORAGE_BUCKET).remove(valid.map((r) => r.file_path!));
      if (rmErr) {
        out.failed += valid.length;
        logger.error('retention_storage_failed', { step: 'expired_pdfs', error: rmErr.message });
        break; // rows untouched: retried tomorrow
      }
    }
    const { error: upErr } = await admin
      .from('contracts')
      .update({ file_path: null, file_deleted_at: nowIso })
      .in('id', rows.map((r) => r.id));
    if (upErr) throw upErr; // remove() ignores missing objects, so the next run heals this
    out.removed += valid.length;
    out.skippedPathMismatch += invalid.length;
  }
}

/** Step 2: pending_upload rows older than 24 h, with any object they own. */
async function sweepPending(admin: Admin, now: Date, out: RetentionSummary['pendingSweep']) {
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_TTL_HOURS * 3_600_000).toISOString();
  for (let i = 0; i < MAX_BATCHES_PER_STEP; i++) {
    const { data: rows, error } = await admin
      .from('contracts')
      .select('id, user_id, file_path')
      .eq('status', 'pending_upload')
      .lt('created_at', cutoff)
      .limit(BATCH);
    if (error) throw error;
    if (rows.length === 0) break;

    const paths = rows.filter((r) => r.file_path && isContractPath(r.file_path, r.user_id, r.id)).map((r) => r.file_path!);
    if (paths.length) {
      const { error: rmErr } = await admin.storage.from(STORAGE_BUCKET).remove(paths);
      if (rmErr) logger.warn('retention_storage_failed', { step: 'pending_sweep', error: rmErr.message }); // orphans → step 3
      else out.objectsRemoved += paths.length;
    }
    // The status filter keeps a row that moved to 'ready' since the select.
    const { error: delErr, count } = await admin
      .from('contracts')
      .delete({ count: 'exact' })
      .in('id', rows.map((r) => r.id))
      .eq('status', 'pending_upload');
    if (delErr) throw delErr;
    out.rowsDeleted += count ?? 0;
    if ((count ?? 0) === 0) break; // nothing deletable left in this batch; avoid re-selecting it forever
  }
}

/** Step 3: objects whose contract row no longer exists, older than 24 h. Non-UUID folders are never touched. */
async function sweepOrphans(admin: Admin, now: Date, out: RetentionSummary['orphanSweep']) {
  const bucket = admin.storage.from(STORAGE_BUCKET);
  const minCreated = now.getTime() - ORPHAN_MIN_AGE_MS;
  let userFolders = (await listStorageEntries(bucket, '')).filter((e) => e.id === null);
  if (userFolders.length > MAX_ORPHAN_USER_FOLDERS) {
    out.truncated = true;
    userFolders = userFolders.slice(0, MAX_ORPHAN_USER_FOLDERS);
  }

  for (const userFolder of userFolders) {
    if (!UUID.test(userFolder.name)) {
      logger.warn('retention_unexpected_folder', { folder_depth: 1 });
      continue;
    }
    out.foldersScanned++;
    const contractFolders = (await listStorageEntries(bucket, userFolder.name)).filter((e) => e.id === null);
    const candidates = contractFolders.filter((f) => {
      if (UUID.test(f.name)) return true;
      logger.warn('retention_unexpected_folder', { folder_depth: 2 });
      return false;
    });

    const existing = new Set<string>();
    for (const ids of chunk(candidates.map((f) => f.name), BATCH)) {
      const { data, error } = await admin.from('contracts').select('id').in('id', ids);
      if (error) throw error;
      for (const r of data) existing.add(r.id);
    }

    for (const folder of candidates.filter((f) => !existing.has(f.name))) {
      const prefix = `${userFolder.name}/${folder.name}`;
      const files = (await listStorageEntries(bucket, prefix)).filter(
        (f) => f.id !== null && f.created_at !== null && Date.parse(f.created_at) < minCreated,
      );
      for (const batch of chunk(files.map((f) => `${prefix}/${f.name}`), BATCH)) {
        const { error } = await bucket.remove(batch);
        if (error) throw error;
        out.objectsRemoved += batch.length;
      }
    }
  }
}
