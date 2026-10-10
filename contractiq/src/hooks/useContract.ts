'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ContractDetail } from '@/types/api';

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60_000;

/**
 * Refetch the detail shortly before the 1 h signed PDF URL expires, so the viewer never holds a dead
 * link (07 §6.6). false when there is no URL.
 */
export function signedUrlRefreshDelay(data: ContractDetail | undefined): number | false {
  if (!data?.pdf_url_expires_at) return false;
  const ms = Date.parse(data.pdf_url_expires_at) - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
  return Math.max(ms, 10_000); // never more often than every 10 s (07 §6.6)
}

/** GET /api/contracts/{id} with the server-rendered detail as initial data (06 §7.1). */
export function useContract(id: string, initialData?: ContractDetail) {
  return useQuery({
    queryKey: qk.contract(id),
    queryFn: () => apiFetch<ContractDetail>(`/api/contracts/${id}`),
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => signedUrlRefreshDelay(query.state.data),
  });
}
