import { describe, expect, it } from 'vitest';
import { countTokens } from '@/lib/ai/token-count';
import { MAX_CONTRACT_TOKENS } from '@/lib/constants';

// 03-upload-extraction.md §12 — o200k_base (GPT-4o).
describe('countTokens', () => {
  it('a known string has a known count', () => {
    expect(countTokens('Hello world')).toBe(2);
    expect(countTokens('')).toBe(0);
  });
  it('the 15,000 / 15,001 boundary (synthetic text: " a" is one token each)', () => {
    expect(countTokens(' a'.repeat(15_000))).toBe(15_000);
    expect(countTokens(' a'.repeat(15_001))).toBeGreaterThan(MAX_CONTRACT_TOKENS);
  });
  it('counts [PAGE N] markers (they are sent to the model)', () => {
    expect(countTokens('[PAGE 1]\ntext')).toBeGreaterThan(countTokens('text'));
  });
});
