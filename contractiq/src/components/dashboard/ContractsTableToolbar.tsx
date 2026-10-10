'use client';

import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import type { ListContractsQuery } from '@/types/api';

type TypeFilter = ListContractsQuery['type'];
type SortValue = `${ListContractsQuery['sort']}:${ListContractsQuery['order']}`;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'nda', label: 'NDA' },
  { value: 'msa', label: 'MSA' },
];

// "Sort by" for the < 768 px stacked list, where there are no column headers.
const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'file_name:asc', label: 'Name A–Z' },
  { value: 'file_name:desc', label: 'Name Z–A' },
  // contract_type is a Postgres enum ('nda', 'msa'): ascending puts NDAs first.
  { value: 'contract_type:asc', label: 'Type (NDA first)' },
  { value: 'contract_type:desc', label: 'Type (MSA first)' },
];

export type ContractsTableToolbarProps = {
  type: TypeFilter;
  total: number;
  onTypeChange: (t: TypeFilter) => void;
  sort: ListContractsQuery['sort'];
  order: ListContractsQuery['order'];
  onSortChange: (sort: ListContractsQuery['sort'], order: ListContractsQuery['order']) => void;
};

/** Type filter (segmented control), result count, and the mobile "Sort by" select (10 §8, §9). */
export function ContractsTableToolbar({ type, total, onTypeChange, sort, order, onSortChange }: ContractsTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div role="group" aria-label="Filter by type" className="inline-flex rounded-md border border-border-control bg-surface p-0.5">
          {TYPE_OPTIONS.map((o) => {
            const active = o.value === type;
            return (
              <button
                key={o.label}
                type="button"
                aria-pressed={active}
                onClick={() => onTypeChange(o.value)}
                className={cn(
                  'h-8 rounded-sm px-3 text-body-lg transition-colors duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  active ? 'bg-brand-subtle text-fg-primary' : 'text-fg-secondary hover:bg-surface-subtle',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="text-body-sm text-fg-secondary" aria-live="polite">
          {total} {total === 1 ? 'contract' : 'contracts'}
        </p>
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <span aria-hidden className="text-body-sm text-fg-secondary">
          Sort by
        </span>
        <Select
          aria-label="Sort by"
          value={`${sort}:${order}`}
          options={SORT_OPTIONS}
          onValueChange={(v) => {
            const [s, o] = v.split(':') as [ListContractsQuery['sort'], ListContractsQuery['order']];
            onSortChange(s, o);
          }}
          className="w-48"
        />
      </div>
    </div>
  );
}
