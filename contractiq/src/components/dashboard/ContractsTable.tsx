'use client';

import { format } from 'date-fns';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { contractsSearch, useContracts } from '@/hooks/useDashboard';
import { cn } from '@/lib/utils';
import { ListContractsQuerySchema } from '@/lib/validation/contract';
import type { ContractListItem, ListContractsQuery, ListContractsResponse } from '@/types/api';
import { ContractRowMenu } from './ContractRowMenu';
import { ContractStatusPill } from './ContractStatusPill';
import { ContractsTableToolbar } from './ContractsTableToolbar';
import { TablePagination } from './TablePagination';

type SortColumn = ListContractsQuery['sort'];

const DEFAULT_QUERY = ListContractsQuerySchema.parse({});
const LOW_CONFIDENCE_RED_AT = 3; // 1–2 amber, 3+ red

const sameQuery = (a: ListContractsQuery, b: ListContractsQuery) =>
  a.sort === b.sort && a.order === b.order && a.type === b.type && a.page === b.page && a.page_size === b.page_size;

/** Contract history: sortable, filterable, paginated; the URL holds the state (10 §7, §8). */
export function ContractsTable({ initialQuery, initialData }: { initialQuery: ListContractsQuery; initialData: ListContractsResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = useMemo(() => ListContractsQuerySchema.safeParse(Object.fromEntries(searchParams)), [searchParams]);
  const query = parsed.success ? parsed.data : DEFAULT_QUERY;
  const { data, isPlaceholderData, isError, isFetching, refetch } = useContracts(
    query,
    sameQuery(query, initialQuery) ? initialData : undefined,
  );

  // URL as state (10 §7): defaults omitted, no scroll jump.
  const writeQuery = useCallback(
    (next: ListContractsQuery) => {
      const search = contractsSearch(next);
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false });
    },
    [pathname, router],
  );
  const update = (patch: Partial<ListContractsQuery>) => writeQuery({ ...query, ...patch, page: 1 });
  const setPage = useCallback((page: number) => writeQuery({ ...query, page }), [query, writeQuery]);

  // Invalid params (e.g. ?sort=password&page=-3): rewrite the URL to the defaults.
  useEffect(() => {
    if (!parsed.success) writeQuery(DEFAULT_QUERY);
  }, [parsed.success, writeQuery]);

  // Past the last page (e.g. after deleting its only row): go to the last page.
  useEffect(() => {
    if (data && !isPlaceholderData && data.items.length === 0 && data.total > 0) {
      setPage(Math.ceil(data.total / data.page_size));
    }
  }, [data, isPlaceholderData, setPage]);

  const onSort = (column: SortColumn) => {
    if (query.sort === column) update({ order: query.order === 'asc' ? 'desc' : 'asc' });
    else update({ sort: column, order: column === 'created_at' ? 'desc' : 'asc' });
  };

  const openRow = (e: MouseEvent<HTMLElement>, id: string) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return; // React bubbles clicks from portals (menu, dialog)
    if (target.closest('a, button, [role="menuitem"]')) return; // the link and the actions menu handle themselves
    if (window.getSelection()?.toString()) return; // selecting text is not a click
    router.push(`/contracts/${id}`);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const busy = isPlaceholderData;
  const showError = isError && !isFetching;
  const filterLabel = query.type ? `${query.type.toUpperCase()}s` : 'contracts';

  const status = showError ? (
    <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-6">
      <p role="alert" className="text-body-lg text-fg-primary">
        Couldn&apos;t load contracts
      </p>
      <Button variant="secondary" size="sm" onClick={() => void refetch()}>
        Try again
      </Button>
    </div>
  ) : items.length === 0 && total === 0 ? (
    <p className="px-4 py-6 text-center text-body-lg font-normal text-fg-secondary">No {filterLabel} yet.</p>
  ) : null;

  return (
    <section aria-labelledby="all-contracts-title" className="flex flex-col gap-6">
      <h2 id="all-contracts-title" className="text-h5 text-fg-primary">
        All contracts
      </h2>
      <div className="flex flex-col gap-4">
        <ContractsTableToolbar
          type={query.type}
          total={total}
          onTypeChange={(type) => update({ type })}
          sort={query.sort}
          order={query.order}
          onSortChange={(sort, order) => update({ sort, order })}
        />

        {/* ≥ 768 px: table */}
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
          <table className="w-full border-collapse text-left" aria-busy={busy || undefined}>
            <caption className="sr-only">Contract history</caption>
            <thead>
              <tr className="border-b border-border">
                <SortHeader column="file_name" label="Name" query={query} onSort={onSort} />
                <SortHeader column="contract_type" label="Type" query={query} onSort={onSort} />
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  Low-confidence terms
                </th>
                <SortHeader column="created_at" label="Uploaded" query={query} onSort={onSort} />
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={cn('transition-opacity duration-150 ease-out', busy && 'opacity-50')}>
              {status ? (
                <tr>
                  <td colSpan={6}>{status}</td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr
                    key={c.id}
                    onClick={(e) => openRow(e, c.id)}
                    className="cursor-pointer border-b border-border transition-colors duration-100 ease-out last:border-b-0 hover:bg-surface-subtle"
                  >
                    <td className="max-w-80 px-4 py-3">
                      <NameLink item={c} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{c.contract_type.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusPill status={c.status} reviewCompletedAt={c.review_completed_at} />
                    </td>
                    <td className="px-4 py-3">
                      <LowConfidence item={c} />
                    </td>
                    <td className="px-4 py-3">
                      <DateText iso={c.created_at} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ContractRowMenu contractId={c.id} fileName={c.file_name} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* < 768 px: stacked cards; sorting lives in the toolbar's "Sort by" select */}
        <div className="md:hidden" aria-busy={busy || undefined}>
          {status ? (
            <div className="rounded-lg border border-border bg-surface">{status}</div>
          ) : (
            <ul aria-label="Contract history" className={cn('flex flex-col gap-2 transition-opacity duration-150 ease-out', busy && 'opacity-50')}>
              {items.map((c) => (
                <li
                  key={c.id}
                  onClick={(e) => openRow(e, c.id)}
                  className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-colors duration-100 ease-out hover:bg-surface-subtle"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <NameLink item={c} />
                    </div>
                    <ContractRowMenu contractId={c.id} fileName={c.file_name} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{c.contract_type.toUpperCase()}</Badge>
                    <ContractStatusPill status={c.status} reviewCompletedAt={c.review_completed_at} />
                    <DateText iso={c.created_at} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data && <TablePagination page={query.page} pageSize={query.page_size} total={total} onPageChange={setPage} />}
      </div>
    </section>
  );
}

const TH = 'px-4 py-3 text-body-sm font-normal text-fg-secondary';

function SortHeader({
  column,
  label,
  query,
  onSort,
}: {
  column: SortColumn;
  label: string;
  query: ListContractsQuery;
  onSort: (c: SortColumn) => void;
}) {
  const active = query.sort === column;
  const ariaSort = active ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active ? (query.order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th scope="col" aria-sort={ariaSort} className={TH}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded-sm px-1 transition-colors duration-100 ease-out hover:text-fg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          active && 'text-fg-primary',
        )}
      >
        {label}
        <Icon aria-hidden className="h-3 w-3" />
      </button>
    </th>
  );
}

/** The keyboard/AT path into a row. Long names are truncated; the full name is the title and link text. */
function NameLink({ item }: { item: ContractListItem }) {
  return (
    <Link
      href={`/contracts/${item.id}`}
      title={item.file_name}
      className="block truncate rounded-sm text-body-lg text-fg-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {item.file_name}
    </Link>
  );
}

function LowConfidence({ item }: { item: ContractListItem }) {
  if (item.status !== 'completed') {
    return (
      <>
        <span aria-hidden className="text-body-lg text-fg-secondary">
          —
        </span>
        <span className="sr-only">Not available</span>
      </>
    );
  }
  const n = item.low_confidence_count;
  if (n === 0) return <span className="text-body-lg font-normal text-fg-secondary">0</span>;
  return (
    <Badge tone={n >= LOW_CONFIDENCE_RED_AT ? 'danger' : 'warning'} icon={AlertTriangle}>
      {n}
    </Badge>
  );
}

/** Absolute upload date. Server (UTC) and browser time zones can differ near midnight. */
function DateText({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning className="whitespace-nowrap text-body-sm text-fg-secondary">
      {format(new Date(iso), 'd MMM yyyy')}
    </time>
  );
}
