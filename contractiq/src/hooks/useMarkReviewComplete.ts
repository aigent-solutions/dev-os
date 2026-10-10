'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import { ApiClientError, apiFetch, errorTone } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ContractDetail, ContractUpdateResponse } from '@/types/api';

/** Mark review complete / undo (06 §7.2). Not optimistic: the button waits for the server. */
export function useMarkReviewComplete(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewCompleted: boolean) =>
      apiFetch<ContractUpdateResponse>(`/api/contracts/${id}`, { method: 'PATCH', json: { review_completed: reviewCompleted } }),
    onSuccess: (res, reviewCompleted) => {
      qc.setQueryData<ContractDetail>(qk.contract(id), (d) =>
        d ? { ...d, contract: { ...d.contract, review_completed_at: res.review_completed_at } } : d,
      );
      void qc.invalidateQueries({ queryKey: qk.dashboardSummary() });
      void qc.invalidateQueries({ queryKey: ['contracts'] });
      if (reviewCompleted) toast({ title: 'Marked as reviewed', tone: 'success' });
    },
    onError: (e) => {
      toast({
        title: "Couldn't update the review status",
        description: e instanceof ApiClientError ? e.message : undefined,
        tone: errorTone(e),
      });
    },
  });
}
