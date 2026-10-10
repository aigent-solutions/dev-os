'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/Toast';
import { ApiClientError, apiFetch, errorTone } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';
import type { StatusResponse } from './useContractStatus';

// "Process Contract" and "Try again" (05 §7).
export type ProcessResponse =
  | { contract_id: string; status: 'processing'; processing_stage: 'analysing'; mode: 'background' }
  | {
      contract_id: string;
      status: 'completed' | 'error';
      mode: 'sync';
      error: { code: string; message: string; retryable: true } | null;
    };

export function useProcessContract(contractId: string | null, opts: { from: 'wizard' | 'results' } = { from: 'wizard' }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (customTerms: string[]) =>
      apiFetch<ProcessResponse>(`/api/contracts/${contractId}/process`, {
        method: 'POST',
        json: { custom_terms: customTerms },
        timeoutMs: 30_000,
      }),
    onMutate: () => {
      if (opts.from === 'wizard') useUploadWizardStore.getState().setStep('processing');
    },
    onSuccess: (r) => {
      if (!contractId) return;
      const status: StatusResponse = {
        status: r.status,
        processing_stage: r.status === 'processing' ? 'analysing' : null,
        error: r.mode === 'sync' && r.error ? { code: r.error.code, message: r.error.message } : null,
        elapsed_ms: null,
      };
      queryClient.setQueryData(qk.contractStatus(contractId), status);
      void queryClient.invalidateQueries({ queryKey: qk.contract(contractId) });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
      router.push(`/contracts/${contractId}`);
      router.refresh();
    },
    onError: (e) => {
      const message = e instanceof ApiClientError ? e.message : 'Something went wrong on our side. Please try again.';
      if (opts.from === 'wizard') {
        const store = useUploadWizardStore.getState();
        // A sync request killed at the platform limit: the contract page shows progress, then the outcome.
        if (e instanceof ApiClientError && e.code === 'NETWORK_ERROR' && contractId) {
          router.push(`/contracts/${contractId}`);
          return;
        }
        store.setError({ code: e instanceof ApiClientError ? e.code : 'INTERNAL_ERROR', message });
        store.setStep('ready');
      } else {
        toast({ title: "Couldn't start the analysis", description: message, tone: errorTone(e) });
      }
    },
  });
}
