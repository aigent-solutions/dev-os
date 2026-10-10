'use client';

import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDashboardSummary } from '@/hooks/useDashboard';
import type { RecentContract } from '@/types/api';
import { ContractStatusPill } from './ContractStatusPill';

/** "2 days ago" with the absolute date in <time> + tooltip. Server and browser clocks/zones can differ. */
export function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <Tooltip content={format(d, 'd MMM yyyy, HH:mm')}>
      <time dateTime={iso} suppressHydrationWarning className="whitespace-nowrap text-body-sm text-fg-secondary">
        {formatDistanceToNow(d, { addSuffix: true })}
      </time>
    </Tooltip>
  );
}

/** Last 5 contracts with status and date (10 §8, Flow 2). Shares the summary query. */
export function RecentContractsList({ initialData }: { initialData: RecentContract[] }) {
  const { data } = useDashboardSummary();
  const recent = data?.recent ?? initialData;
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-6">
      <h2 id="recent-title" className="text-h5 text-fg-primary">
        Recent contracts
      </h2>
      <ul className="flex flex-col rounded-lg border border-border bg-surface">
        {recent.map((c) => (
          <li key={c.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/contracts/${c.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-3 transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            >
              <span className="min-w-0 flex-1 truncate text-body-lg text-fg-primary" title={c.file_name}>
                {c.file_name}
              </span>
              <Badge>{c.contract_type.toUpperCase()}</Badge>
              <ContractStatusPill status={c.status} reviewCompletedAt={c.review_completed_at} />
              <RelativeTime iso={c.created_at} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
