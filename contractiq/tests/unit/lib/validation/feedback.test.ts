import { describe, expect, it } from 'vitest';
import { FeedbackSchema } from '@/lib/validation/feedback';

// 11-feedback.md §12.
describe('FeedbackSchema', () => {
  it('requires rating', () => expect(FeedbackSchema.safeParse({}).success).toBe(false));
  it("'' → null comment; accuracy omitted → null", () => {
    expect(FeedbackSchema.parse({ rating: 'up', comment: '   ' })).toEqual({ rating: 'up', comment: null, accuracy_rating: null });
  });
  it('1,000 chars ok, 1,001 rejected', () => {
    expect(FeedbackSchema.safeParse({ rating: 'down', comment: 'c'.repeat(1000) }).success).toBe(true);
    expect(FeedbackSchema.safeParse({ rating: 'down', comment: 'c'.repeat(1001) }).success).toBe(false);
  });
  it('rejects unknown keys (nps_score is not client-settable)', () => expect(FeedbackSchema.safeParse({ rating: 'up', nps_score: 9 }).success).toBe(false));
});
