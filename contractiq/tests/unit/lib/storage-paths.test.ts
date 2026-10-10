import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/api/errors';
import { assertContractPath, chunk, isContractPath } from '@/lib/storage-paths';

// 13-data-lifecycle-gdpr.md §12 — checked before every service-role Storage call.
const U = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('isContractPath', () => {
  it('accepts {user}/{contract}/file', () => {
    expect(isContractPath(`${U}/${C}/contract.pdf`, U, C)).toBe(true);
  });
  it.each([
    ["another user's id", `${OTHER}/${C}/contract.pdf`],
    ['another contract id', `${U}/${OTHER}/contract.pdf`],
    ['.. segments', `${U}/${C}/../${OTHER}/x.pdf`],
    ['.. in the file name', `${U}/${C}/..`],
    ['extra depth', `${U}/${C}/sub/contract.pdf`],
    ['missing file name', `${U}/${C}`],
    ['prefix collision', `${U}/${C}x/contract.pdf`],
    ['empty', ''],
  ])('rejects %s', (_label, path) => {
    expect(isContractPath(path, U, C)).toBe(false);
  });

  it('assertContractPath throws a 403 FORBIDDEN (path_mismatch)', () => {
    try {
      assertContractPath(`${OTHER}/${C}/contract.pdf`, U, C);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
      expect((e as AppError).details).toEqual({ reason: 'path_mismatch' });
    }
  });
});

describe('chunk', () => {
  it.each([
    [0, []],
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ])('%i items → batch sizes %j', (n, sizes) => {
    const items = Array.from({ length: n }, (_, i) => i);
    const batches = chunk(items, 100);
    expect(batches.map((b) => b.length)).toEqual(sizes);
    expect(batches.flat()).toEqual(items);
  });
});
