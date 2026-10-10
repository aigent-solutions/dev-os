import { describe, expect, it } from 'vitest';
import { calculateCostUsd } from '@/lib/ai/pricing';

// 12-rate-limiting-usage.md §12. The unit env prices are $2.50 / $10 per million tokens.
describe('calculateCostUsd', () => {
  it('15,000 in / 1,500 out → 0.0525', () => expect(calculateCostUsd(15_000, 1_500)).toBe(0.0525));
  it('rounds to at most 6 decimal places (matches numeric(10,6)), within half a micro-dollar', () => {
    for (const [p, c] of [[1, 1], [333, 7], [12_345, 678], [99_999, 1]] as const) {
      const r = calculateCostUsd(p, c);
      const exact = (p * 2.5 + c * 10) / 1_000_000;
      expect(Number.isInteger(Math.round(r * 1e6)) && Math.abs(r * 1e6 - Math.round(r * 1e6)) < 1e-6).toBe(true);
      expect(Math.abs(r - exact)).toBeLessThanOrEqual(5e-7 + 1e-12);
    }
  });
  it('zero tokens → 0', () => expect(calculateCostUsd(0, 0)).toBe(0));
});
