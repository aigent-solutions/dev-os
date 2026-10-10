'use client';

import { useQuery } from '@tanstack/react-query';
import { Banner } from '@/components/ui/Banner';
import { qk } from '@/lib/query-keys';

/** Shown when /api/health reports 503 or can't be reached (00-foundation.md §5). Placed by AppShell. */
export function MaintenanceBanner() {
  const { data: status, isError } = useQuery({
    queryKey: qk.health(),
    queryFn: () => fetch('/api/health', { cache: 'no-store' }).then((r) => r.status),
    refetchInterval: 60_000,
    retry: false,
  });
  if (status !== 503 && !isError) return null;
  return (
    <Banner tone="warning" className="rounded-none border-x-0 border-t-0">
      ContractIQ is having trouble reaching its database. Some actions may fail — we&apos;re on it.
    </Banner>
  );
}
