'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { DashboardSummary, ListContractsQuery, ListContractsResponse } from '@/types/api';

const STALE_MS = 30_000;
const PROCESSING_POLL_MS = 5_000;

/** GET /api/dashboard/summary, seeded by the server render (10 §7). */
export function useDashboardSummary(initialData?: DashboardSummary) {
  return useQuery({
    queryKey: qk.dashboardSummary(),
    queryFn: () => apiFetch<DashboardSummary>('/api/dashboard/summary'),
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
  });
}

/** Builds the GET /api/contracts query string. Defaults are omitted (same rule as the page URL). */
export function contractsSearch(q: ListContractsQuery): string {
  const p = new URLSearchParams();
  if (q.sort !== 'created_at') p.set('sort', q.sort);
  if (q.order !== 'desc') p.set('order', q.order);
  if (q.type) p.set('type', q.type);
  if (q.page !== 1) p.set('page', String(q.page));
  if (q.page_size !== 20) p.set('page_size', String(q.page_size));
  return p.toString();
}

/**
 * GET /api/contracts (10 §7). Pass initialData only when `query` equals the server-rendered query.
 * Previous rows stay visible while sorting/paging; polls every 5 s while a visible row is processing.
 */
export function useContracts(query: ListContractsQuery, initialData?: ListContractsResponse) {
  return useQuery({
    queryKey: qk.contracts(query),
    queryFn: () => {
      const search = contractsSearch(query);
      return apiFetch<ListContractsResponse>(`/api/contracts${search ? `?${search}` : ''}`);
    },
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.status === 'processing') ? PROCESSING_POLL_MS : false),
  });
}
