import { describe, expect, it } from 'vitest';
import { normaliseText } from '../../../evals/lib/normalise';

// 15-evals.md §12.
describe('normaliseText', () => {
  it.each([
    ['NFKC + quote folding', '“Acme” ‘Ltd’ ﬁnance', 'acme ltd finance'],
    ['& → and', 'Smith & Jones', 'smith and jones'],
    ['dashes', 'two–year — term', 'two-year - term'],
    ['leading article', 'The State of Delaware', 'state of delaware'],
    ['leading "a"', 'A monthly fee', 'monthly fee'],
    ['trailing punctuation', 'England and Wales.;', 'england and wales'],
    ['whitespace', '  many \n  spaces ', 'many spaces'],
  ])('%s', (_l, input, out) => expect(normaliseText(input)).toBe(out));
});
