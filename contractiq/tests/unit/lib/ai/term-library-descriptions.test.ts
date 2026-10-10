import { describe, expect, it } from 'vitest';
import { TERM_LIBRARY } from '@/lib/ai/term-library';

// 14-onboarding-a11y.md §13 — every jargon tooltip is plain English and short.
const LEGAL_LATIN = /\b(inter alia|mutatis mutandis|pari passu)\b/i;

describe.each(['nda', 'msa'] as const)('%s term descriptions', (type) => {
  it.each(TERM_LIBRARY[type].map((t) => [t.key, t.description]))('%s: 1–160 chars, no unexplained legal Latin', (_key, description) => {
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThanOrEqual(1);
    expect(description!.length).toBeLessThanOrEqual(160);
    expect(description).not.toMatch(LEGAL_LATIN);
  });
});
