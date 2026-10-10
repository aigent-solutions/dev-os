'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { STATUS_POLL_INTERVAL_MS } from '@/lib/constants';
import { qk } from '@/lib/query-keys';
import type { ContractStatus, ProcessingStage } from '@/types/domain';

export type StatusResponse = {
  status: ContractStatus;
  processing_stage: ProcessingStage | null;
  error: { code: string; message: string } | null;
  elapsed_ms: number | null;
};

const TERMINAL = new Set<ContractStatus>(['completed', 'error', 'ready', 'pending_upload']);

/** Polls every 2 s while processing; stops on any terminal status (05 §7). */
export function useContractStatus(contractId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: qk.contractStatus(contractId),
    queryFn: () => apiFetch<StatusResponse>(`/api/contracts/${contractId}/status`),
    enabled,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.status) ? false : STATUS_POLL_INTERVAL_MS),
    refetchIntervalInBackground: false,
    retry: 2,
  });
}
