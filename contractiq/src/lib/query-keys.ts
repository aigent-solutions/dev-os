import type { ListContractsQuery } from '@/types/api';

// TanStack Query keys — docs/specs/README.md §3.10. Use these only; never inline keys.
export const qk = {
  health: () => ['health'] as const,
  dashboardSummary: () => ['dashboard-summary'] as const,
  contracts: (p: ListContractsQuery) => ['contracts', p] as const,
  contract: (id: string) => ['contract', id] as const,
  contractStatus: (id: string) => ['contract-status', id] as const,
  chat: (contractId: string) => ['chat', contractId] as const,
  profile: () => ['profile'] as const,
};
