import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '@/lib/glossary';

// 14-onboarding-a11y.md §13.
describe('GLOSSARY', () => {
  it.each(Object.entries(GLOSSARY))('%s: non-empty plain English, ≤ 160 chars', (_k, text) => {
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(160);
  });
});
