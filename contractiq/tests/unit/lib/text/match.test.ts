import { describe, expect, it } from 'vitest';
import { findNormalizedRange, findSentenceRange, matchCandidates, normalizeForMatch } from '@/lib/text/match';

// 07-document-viewer.md §12 — the shared normalisation for highlighting (and server-side verification).
describe('normalizeForMatch', () => {
  it.each([
    ['“Curly” ‘quotes’', '"curly" \'quotes\''],
    ['en–dash and em—dash', 'en-dash and em-dash'],
    ['non breaking', 'non breaking'],
    ['soft­hyphen', 'softhyphen'],
    ['many    spaces\n\nand lines', 'many spaces and lines'],
    ['ﬁnal ligature', 'final ligature'],
  ])('%j → %j', (input, out) => expect(normalizeForMatch(input)).toBe(out));
});

describe('findNormalizedRange', () => {
  it('maps back to the original offsets across double spaces and line breaks', () => {
    const hay = 'Intro.  The Receiving\nParty  shall keep it secret. Outro.';
    const r = findNormalizedRange(hay, normalizeForMatch('The Receiving Party shall keep it secret.'));
    expect(r).not.toBeNull();
    expect(hay.slice(r!.start, r!.end)).toBe('The Receiving\nParty  shall keep it secret.');
  });
  it('a miss → null', () => expect(findNormalizedRange('abc', 'xyz')).toBeNull());
});

describe('matchCandidates', () => {
  const long = 'The Recipient shall hold all Confidential Information in strict confidence for a period of five years; it shall not disclose it to anyone without consent.';
  it('a long sentence → [full, first 80 chars, longest clause]', () => {
    const c = matchCandidates(long);
    expect(c[0]).toBe(normalizeForMatch(long));
    expect(c[1]).toBe(normalizeForMatch(long).slice(0, 80));
    expect(c[2]).toBe('the recipient shall hold all confidential information in strict confidence for a period of five years');
  });
  it('dedupes and drops needles under 12 characters', () => {
    expect(matchCandidates('Short one.')).toEqual([]);
    const c = matchCandidates('A sentence that is not long at all.');
    expect(new Set(c).size).toBe(c.length);
  });
});

describe('findSentenceRange', () => {
  const page = 'Clause 4. The Recipient shall hold all Confidential Information in strict confidence for a period of five years and shall not disclose it to anyone. Clause 5.';
  it('an exact hit', () => {
    const s = 'The Recipient shall hold all Confidential Information in strict confidence for a period of five years and shall not disclose it to anyone.';
    const r = findSentenceRange(page, s)!;
    expect(page.slice(r.start, r.end)).toBe(s);
  });
  it('hits through the 80-char prefix when the tail differs (extraction artefact)', () => {
    const r = findSentenceRange(page, 'The Recipient shall hold all Confidential Information in strict confidence for a period of five years and sh@ll n0t disclose.');
    expect(r).not.toBeNull();
    expect(page.slice(r!.start).startsWith('The Recipient')).toBe(true);
  });
  it('a miss → null', () => expect(findSentenceRange(page, 'Nothing like this appears anywhere in the page text.')).toBeNull());
});
