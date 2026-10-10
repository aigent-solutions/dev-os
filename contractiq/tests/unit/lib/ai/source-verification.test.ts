import { describe, expect, it } from 'vitest';
import { verifySourceSentence } from '@/lib/ai/source-verification';

// 05-key-term-extraction.md §12 — the model's source_sentence must exist in the contract text.
const TEXT = [
  '[PAGE 1]',
  'MUTUAL NON-DISCLOSURE AGREEMENT',
  'The Receiving Party shall keep all “Confidential Information” strictly confidential.',
  'This obligation lasts for two years — unless terminated earlier.',
  'Notices must be sent by email.',
  '[PAGE 2]',
  'The Recipient shall not disclose information to any third party without consent.',
  'Payments are due within thirty days of the invoice date and are non-',
  'refundable in all circumstances.',
  'This sentence starts on page two and continues',
  '[PAGE 3]',
  'across the page break into page three.',
  'Notices must be sent by email.',
].join('\n');

describe('verifySourceSentence', () => {
  it('straight quotes match curly quotes', () => {
    const r = verifySourceSentence(TEXT, 'The Receiving Party shall keep all "Confidential Information" strictly confidential.');
    expect(r).toMatchObject({ found: true, page: 1 });
  });

  it('a hyphen matches an em dash', () => {
    expect(verifySourceSentence(TEXT, 'This obligation lasts for two years - unless terminated earlier.')).toMatchObject({ found: true, page: 1 });
  });

  it('a normal space matches a non-breaking space', () => {
    expect(verifySourceSentence(TEXT, 'shall not disclose information to any third party without consent')).toMatchObject({ found: true, page: 2 });
  });

  it('is case-insensitive and collapses whitespace and newlines', () => {
    expect(verifySourceSentence(TEXT, 'THE   RECEIVING party shall KEEP all\n"confidential information"')).toMatchObject({ found: true, page: 1 });
  });

  it('a line-wrap hyphen is joined ("non-\\nrefundable" = "nonrefundable")', () => {
    expect(verifySourceSentence(TEXT, 'are nonrefundable in all circumstances')).toMatchObject({ found: true, page: 2 });
  });

  it('a sentence spanning a [PAGE N] marker maps to the page where it starts', () => {
    const r = verifySourceSentence(TEXT, 'This sentence starts on page two and continues across the page break into page three.');
    expect(r).toMatchObject({ found: true, page: 2 });
  });

  it('needles shorter than 12 characters are never "found"', () => {
    expect(verifySourceSentence(TEXT, 'by email.')).toEqual({ found: false, offset: null, page: null });
  });

  it('a long needle (> 120 chars) falls back to its first 80 characters', () => {
    const long = 'The Receiving Party shall keep all "Confidential Information" strictly confidential. ' + 'and then some hallucinated words appended by the model to make it long';
    expect(long.length).toBeGreaterThan(120);
    expect(verifySourceSentence(TEXT, long)).toMatchObject({ found: true, page: 1 });
  });

  it('a short needle (≤ 120) gets no prefix fallback', () => {
    expect(verifySourceSentence(TEXT, 'The Receiving Party shall keep all records forever.').found).toBe(false);
  });

  it('a trailing period (or ;:,) is ignored', () => {
    expect(verifySourceSentence(TEXT, 'Notices must be sent by email;').found).toBe(true);
  });

  it('the first occurrence wins', () => {
    const r = verifySourceSentence(TEXT, 'Notices must be sent by email.');
    expect(r.page).toBe(1);
    expect(r.offset).toBe(TEXT.indexOf('Notices must be sent by email.'));
  });

  it('a fabricated sentence is not found', () => {
    expect(verifySourceSentence(TEXT, 'The liability of each party is capped at $1,000,000.')).toEqual({ found: false, offset: null, page: null });
  });
});
