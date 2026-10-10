import { describe, expect, it } from 'vitest';
import { KeyTermUpdateSchema } from '@/lib/validation/key-term';

// 08-inline-editing.md §12.
describe('KeyTermUpdateSchema', () => {
  it('trims and rejects empty', () => {
    expect(KeyTermUpdateSchema.parse({ value: '  England  ' })).toEqual({ value: 'England' });
    expect(KeyTermUpdateSchema.safeParse({ value: '   ' }).success).toBe(false);
  });
  it('2,000 characters ok; 2,001 rejected', () => {
    expect(KeyTermUpdateSchema.safeParse({ value: 'v'.repeat(2000) }).success).toBe(true);
    expect(KeyTermUpdateSchema.safeParse({ value: 'v'.repeat(2001) }).success).toBe(false);
  });
  it('rejects unknown keys (e.g. confidence_score)', () => {
    expect(KeyTermUpdateSchema.safeParse({ value: 'x', confidence_score: 99 }).success).toBe(false);
  });
  it('accepts page_number null; rejects 0 and fractions', () => {
    expect(KeyTermUpdateSchema.safeParse({ value: 'x', page_number: null }).success).toBe(true);
    expect(KeyTermUpdateSchema.safeParse({ value: 'x', page_number: 0 }).success).toBe(false);
    expect(KeyTermUpdateSchema.safeParse({ value: 'x', page_number: 1.5 }).success).toBe(false);
  });
});
