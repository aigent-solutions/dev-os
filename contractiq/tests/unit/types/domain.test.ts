import { describe, expect, it } from 'vitest';
import { confidenceBand } from '@/types/domain';

// 00 §12.2 / 06 §12.
describe('confidenceBand', () => {
  it.each([
    [0, 'low'], [49, 'low'], [50, 'medium'], [79, 'medium'], [80, 'high'], [100, 'high'],
  ] as const)('%i → %s', (score, band) => expect(confidenceBand(score)).toBe(band));
});
