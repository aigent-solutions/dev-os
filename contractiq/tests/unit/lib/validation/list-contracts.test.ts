import { describe, expect, it } from 'vitest';
import { ListContractsQuerySchema } from '@/lib/validation/contract';

// 10-dashboard.md §12.
describe('ListContractsQuerySchema', () => {
  it('defaults', () => expect(ListContractsQuerySchema.parse({})).toEqual({ sort: 'created_at', order: 'desc', page: 1, page_size: 20 }));
  it('coerces page and page_size from query strings', () => expect(ListContractsQuerySchema.parse({ page: '3', page_size: '50' })).toMatchObject({ page: 3, page_size: 50 }));
  it.each([[{ sort: 'password' }], [{ sort: 'user_id' }], [{ page_size: '51' }], [{ page: '0' }], [{ order: 'up' }], [{ type: 'sow' }]])('rejects %j', (q) => {
    expect(ListContractsQuerySchema.safeParse(q).success).toBe(false);
  });
});
