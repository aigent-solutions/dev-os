'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from '@/components/ui/Toast';
import { useDashboardSummary } from '@/hooks/useDashboard';
import type { DashboardSummary } from '@/types/api';

/** Total · NDAs · MSAs (10 §8). On refetch error the cards keep their last data. */
export function DashboardSummaryCards({ initialData }: { initialData: DashboardSummary }) {
  const router = useRouter();
  const { data = initialData, errorUpdatedAt, isError } = useDashboardSummary(initialData);

  useEffect(() => {
    if (isError) toast({ title: "Couldn't refresh your summary", tone: 'danger' });
  }, [isError, errorUpdatedAt]);

  // Deleting the last contract: re-render the server page so it shows the empty state.
  useEffect(() => {
    if (data.total === 0) router.refresh();
  }, [data.total, router]);

  const cards = [
    { label: 'Total contracts', value: data.total },
    { label: 'NDAs', value: data.by_type.nda },
    { label: 'MSAs', value: data.by_type.msa },
  ];
  return (
    <section aria-labelledby="summary-title">
      <h2 id="summary-title" className="sr-only">
        Summary
      </h2>
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-4">
            <dt className="text-body-sm text-fg-secondary">{c.label}</dt>
            <dd className="text-h5 text-fg-primary">{c.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
