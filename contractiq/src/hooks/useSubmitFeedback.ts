'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ContractDetail, FeedbackResult } from '@/types/api';

export type FeedbackPayload = { rating: 'up' | 'down'; comment?: string; accuracy_rating?: 'yes' | 'partially' | 'no' | null };

/** PUT feedback (11 §7.1). Keeps the cached contract detail's prefill in sync. */
export function useSubmitFeedback(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackPayload) =>
      apiFetch<FeedbackResult>(`/api/contracts/${contractId}/feedback`, { method: 'PUT', json: input }),
    onSuccess: (res) => {
      qc.setQueryData<ContractDetail>(qk.contract(contractId), (d) =>
        d ? { ...d, feedback: { rating: res.rating, comment: res.comment, accuracy_rating: res.accuracy_rating } } : d,
      );
    },
  });
}
