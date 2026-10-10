'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

/** DELETE /api/contracts/{id} (13 §7). Not optimistic. A 404 means it is already gone, so it counts as deleted. */
export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await apiFetch<void>(`/api/contracts/${id}`, { method: 'DELETE' });
      } catch (e) {
        if (!(e instanceof ApiClientError && e.status === 404)) throw e;
      }
    },
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.contract(id) });
      qc.removeQueries({ queryKey: qk.contractStatus(id) });
      qc.removeQueries({ queryKey: qk.chat(id) });
      void qc.invalidateQueries({ queryKey: ['contracts'] });
      void qc.invalidateQueries({ queryKey: qk.dashboardSummary() });
    },
  });
}
