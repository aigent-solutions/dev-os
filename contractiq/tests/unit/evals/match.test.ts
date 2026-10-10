import { describe, expect, it } from 'vitest';
import { matchTerm } from '../../../evals/lib/match';
import { amountsEqual, parseAmounts, parseDate, parseDuration } from '../../../evals/lib/normalise';

// 15-evals.md §12.
type L = Parameters<typeof matchTerm>[0];
const label = (over: Partial<L>): L => ({ present: true, expected_value: '', match_type: 'exact_normalised', expected_page: 1, acceptable_pages: [1], ...over }) as L;
const ctx = { jurisdiction: 'US-DE' };

describe('exact_normalised', () => {
  it('expected value or a variant is a substring of the AI value', () => {
    const l = label({ expected_value: 'Delaware', acceptable_variants: ['State of Delaware'] });
    expect(matchTerm(l, 'Governed by the laws of the State of Delaware.', ctx)).toBe(true);
    expect(matchTerm(l, 'New York law', ctx)).toBe(false);
  });
  it('parties: every group must have a variant', () => {
    const l = label({ expected_value: 'Acme and Beta', expected_parties: [['Acme Inc', 'Acme'], ['Beta LLC', 'Beta']] });
    expect(matchTerm(l, 'Acme and Beta LLC', ctx)).toBe(true);
    expect(matchTerm(l, 'Acme Inc only', ctx)).toBe(false);
  });
});

describe('numeric', () => {
  const eq = (a: string, b: string) => amountsEqual(parseAmounts(a), parseAmounts(b));
  it.each([
    ['$1,000,000', 'USD 1 million', true],
    ['1.5%', '1.5 percent', true],
    ['£500k', 'GBP 500,000', true],
    ['€2.5m', '2,500,000 euros', true],
    ['$1,000,000', '£1,000,000', false],
    ['$500,000', '$50,000', false],
  ])('%s vs %s → %s', (a, b, out) => expect(eq(a, b)).toBe(out));
  it('through matchTerm', () => expect(matchTerm(label({ match_type: 'numeric', expected_value: '$500,000' }), 'Liability capped at USD 500,000', ctx)).toBe(true));
});

describe('duration', () => {
  it('"thirty-six (36) months" = "3 years"; "90 days" ≠ "3 months"', () => {
    expect(parseDuration('thirty-six (36) months')).toEqual(parseDuration('3 years'));
    expect(parseDuration('90 days')).not.toEqual(parseDuration('3 months'));
  });
  it('the survival flag requires the AI value to mention survival', () => {
    const l = label({ match_type: 'duration', expected_value: '3 years', survives_termination: true });
    expect(matchTerm(l, '3 years; obligations survive termination', ctx)).toBe(true);
    expect(matchTerm(l, '3 years', ctx)).toBe(false);
  });
});

describe('date', () => {
  it('UK reads 03/04/2026 as 3 April; US as 4 March', () => {
    expect(parseDate('03/04/2026', true)).toBe('2026-04-03');
    expect(parseDate('03/04/2026', false)).toBe('2026-03-04');
  });
  it('different formats of the same date match', () => {
    const l = label({ match_type: 'date', expected_value: '1 March 2026' });
    expect(matchTerm(l, 'Effective March 1, 2026', { jurisdiction: 'UK' })).toBe(true);
    expect(matchTerm(l, '2026-03-02', { jurisdiction: 'UK' })).toBe(false);
  });
  it('a relative date falls back to exact matching against variants', () => {
    const l = label({ match_type: 'date', expected_value: 'the date of last signature', acceptable_variants: ['last signature'] });
    expect(matchTerm(l, 'Effective on the date of last signature', ctx)).toBe(true);
  });
});

describe('semantic (rules mode)', () => {
  const l = label({ match_type: 'semantic', expected_value: 'x', required_elements: [['secret', 'confidential'], ['purpose', 'solely']] });
  it('every element group needs one synonym', () => {
    expect(matchTerm(l, 'Keep it confidential and use solely for evaluation', ctx)).toBe(true);
    expect(matchTerm(l, 'Keep it confidential', ctx)).toBe(false);
  });
});
