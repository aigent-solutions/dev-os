import { Button } from '@/components/ui/Button';

export type TablePaginationProps = { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };

/** "Showing x–y of z" with Previous/Next (10 §8). Hidden when everything fits on one page. */
export function TablePagination({ page, pageSize, total, onPageChange }: TablePaginationProps) {
  if (total <= pageSize) return null;
  const lastPage = Math.ceil(total / pageSize);
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-body-sm text-fg-secondary" aria-live="polite">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
