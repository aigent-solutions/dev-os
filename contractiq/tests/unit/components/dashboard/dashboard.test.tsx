import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractStatusPill } from '@/components/dashboard/ContractStatusPill';
import { ContractsTable } from '@/components/dashboard/ContractsTable';
import { TablePagination } from '@/components/dashboard/TablePagination';
import { ListContractsQuerySchema } from '@/lib/validation/contract';
import type { ContractListItem, ListContractsResponse } from '@/types/api';
import { renderWithClient } from '../../../helpers/render';

// 10-dashboard.md §12.
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/dashboard', useSearchParams: () => search }));
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn(async () => ({ items: [], page: 1, page_size: 20, total: 0 })) }));
beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
});

describe('ContractStatusPill', () => {
  it.each([
    ['completed', null, 'Ready to review'],
    ['completed', '2026-10-01T00:00:00Z', 'Reviewed'],
    ['processing', null, 'Analysing…'],
    ['error', null, 'Needs retry'],
    ['ready', null, 'Not analysed'],
  ] as const)('%s (reviewed: %s) → %s', (status, reviewed, label) => {
    render(<ContractStatusPill status={status} reviewCompletedAt={reviewed} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('TablePagination', () => {
  const pag = (page: number, total: number, onPageChange = vi.fn()) => render(<TablePagination page={page} pageSize={20} total={total} onPageChange={onPageChange} />);
  it('hidden when everything fits on one page', () => {
    const { container } = pag(1, 20);
    expect(container).toBeEmptyDOMElement();
  });
  it('first page: Previous disabled; "Showing 1–20 of 45"', () => {
    pag(1, 45);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('Showing 1–20 of 45')).toBeInTheDocument();
  });
  it('last page: Next disabled; "Showing 41–45 of 45"', async () => {
    const onPageChange = vi.fn();
    pag(3, 45, onPageChange);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Showing 41–45 of 45')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('ContractsTable', () => {
  const item = (over: Partial<ContractListItem> = {}): ContractListItem => ({
    id: 'c-1', file_name: 'Acme NDA.pdf', contract_type: 'nda', status: 'completed', page_count: 3, created_at: '2026-10-01T00:00:00Z', review_completed_at: null, low_confidence_count: 0, ...over,
  });
  const data: ListContractsResponse = { items: [item(), item({ id: 'c-2', file_name: 'Beta MSA.pdf', contract_type: 'msa' })], page: 2, page_size: 20, total: 45 };
  const show = (params = '') => {
    search = new URLSearchParams(params);
    const parsed = ListContractsQuerySchema.safeParse(Object.fromEntries(search));
    const query = parsed.success ? parsed.data : ListContractsQuerySchema.parse({}); // as the page does
    renderWithClient(<ContractsTable initialQuery={query} initialData={data} />);
  };
  const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) });
  const lastReplace = () => new URL(String(vi.mocked(router.replace).mock.calls.at(-1)![0]), 'http://x').searchParams;

  it('aria-sort marks only the active column', () => {
    show('sort=file_name&order=asc&page=2');
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Uploaded')).toHaveAttribute('aria-sort', 'none');
  });

  it('clicking the active header toggles order and resets to page 1', async () => {
    show('sort=file_name&order=asc&page=2');
    await userEvent.setup().click(screen.getByRole('button', { name: /Name/ }));
    const p = lastReplace();
    expect(p.get('sort')).toBe('file_name');
    expect(p.get('order')).toBeNull(); // desc is the default, so it's omitted from the URL
    expect(p.get('page')).toBeNull(); // page 1 is the default, omitted
  });

  it('clicking another header sorts by it ascending', async () => {
    show('page=2');
    await userEvent.setup().click(screen.getByRole('button', { name: /^Type/ }));
    expect(lastReplace().get('sort')).toBe('contract_type');
    expect(lastReplace().get('order')).toBe('asc');
  });

  it('clicking a row opens the contract; clicking its menu does not navigate', async () => {
    show();
    const user = userEvent.setup();
    const menus = screen.getAllByRole('button', { name: /actions|options|menu/i });
    await user.click(menus[0]!);
    expect(router.push).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByText('Beta MSA.pdf')[0]!.closest('tr')!.querySelectorAll('td')[1]!);
    expect(router.push).toHaveBeenCalledWith('/contracts/c-2');
  });

  it('invalid URL params are rewritten to the defaults', () => {
    show('sort=password&page=-3');
    expect(router.replace).toHaveBeenCalledWith('/dashboard', { scroll: false });
  });
});
