'use client';

import { useMutation } from '@tanstack/react-query';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { sleep } from '@/lib/utils';
import { useUploadWizardStore, type WizardError } from '@/stores/useUploadWizardStore';
import type { ContractType } from '@/types/domain';

// create → browser upload to Storage (RLS: own folder) → server extract (03 §7).
type CreateContractResponse = { contract_id: string; storage_bucket: string; storage_path: string };
export type ExtractResponse = { contract_id: string; status: 'ready'; page_count: number; word_count: number; token_count: number };

const UPLOAD_FAILED: WizardError = {
  code: 'UPLOAD_FAILED',
  message: "We couldn't upload your file. Check your connection and try again.",
};

/** Storage errors → catalog codes. UPLOAD_FAILED is client-only (README §4). */
export function mapStorageUploadError(err: { message?: string; statusCode?: string | number }): WizardError {
  const status = String(err.statusCode ?? '');
  const msg = err.message ?? '';
  if (status === '413' || /maximum allowed size|too large/i.test(msg)) {
    return { code: 'FILE_TOO_LARGE', message: 'Please upload a PDF under 10 MB.' };
  }
  if (status === '415' || /mime type/i.test(msg)) return { code: 'NOT_A_PDF', message: 'Please upload a PDF under 10 MB.' };
  return UPLOAD_FAILED;
}

class WizardFailure extends Error {
  constructor(public wizardError: WizardError) {
    super(wizardError.code);
  }
}

function toWizardError(e: unknown): WizardError {
  if (e instanceof WizardFailure) return e.wizardError;
  if (e instanceof ApiClientError) return { code: e.code, message: e.message };
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' };
}

const deleteRow = (id: string) => apiFetch(`/api/contracts/${id}`, { method: 'DELETE' }).catch(() => undefined);

export function useUploadContract() {
  const store = useUploadWizardStore;
  return useMutation({
    mutationFn: async ({ file, contractType }: { file: File; contractType: ContractType }) => {
      const created = await apiFetch<CreateContractResponse>('/api/contracts', {
        method: 'POST',
        json: { file_name: file.name, file_size: file.size, contract_type: contractType },
      });
      store.getState().setContractId(created.contract_id);
      store.getState().setStep('uploading');

      const { error: upErr } = await createBrowserSupabase()
        .storage.from(created.storage_bucket)
        .upload(created.storage_path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' });
      if (upErr) {
        await deleteRow(created.contract_id); // the 24 h sweep (13) is the backstop
        throw new WizardFailure(mapStorageUploadError(upErr as { message?: string; statusCode?: string }));
      }
      store.getState().setUploadProgress(100);

      store.getState().setStep('extracting');
      const extract = () =>
        apiFetch<ExtractResponse>(`/api/contracts/${created.contract_id}/extract`, { method: 'POST', timeoutMs: 30_000 });
      try {
        return await extract();
      } catch (e) {
        if (e instanceof ApiClientError && e.code === 'STORAGE_UNAVAILABLE') {
          await sleep(1000);
          try {
            return await extract();
          } catch (e2) {
            await deleteRow(created.contract_id);
            throw e2;
          }
        }
        throw e; // 413/422: the server already cleaned up
      }
    },
    onSuccess: (r) => {
      store.getState().setPageCount(r.page_count);
      store.getState().setStep('ready');
    },
    onError: (e) => {
      store.getState().setError(toWizardError(e));
      store.getState().resetFile();
    },
  });
}
