import { describe, expect, it } from 'vitest';
import { cn, formatBytes, safeFileName, slugify } from '@/lib/utils';

// 00-foundation.md §12.2.
describe('slugify', () => {
  it.each([
    ['Contrat de confidentialité', 'contrat_de_confidentialite'],
    ['Acme NDA (final) v2!!', 'acme_nda_final_v2'],
    ['___', ''],
    ['', ''],
  ])('%j → %j', (input, out) => expect(slugify(input)).toBe(out));
  it('caps at 50 characters without a trailing underscore', () => {
    const s = slugify('a'.repeat(49) + ' b c');
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith('_')).toBe(false);
  });
});

describe('safeFileName', () => {
  it.each([
    ['Acme NDA (final).PDF', 'acme_nda_final.pdf'],
    ['', 'contract.pdf'],
    ['.pdf', 'contract.pdf'],
    ['競業避止.pdf', 'contract.pdf'],
  ])('%j → %j', (input, out) => expect(safeFileName(input)).toBe(out));
  it('caps the base at 80 characters (slug limit 50 applies first)', () => {
    expect(safeFileName('x'.repeat(200) + '.pdf').length).toBeLessThanOrEqual(84);
  });
});

describe('cn', () => {
  it('merges conflicting Tailwind classes, keeping the last', () => expect(cn('px-2', 'px-4')).toBe('px-4'));
  it('keeps a custom font size and a text colour together', () => expect(cn('text-body-sm', 'text-fg-primary')).toBe('text-body-sm text-fg-primary'));
  it('drops falsy values', () => expect(cn('a', false, null, undefined, 'b')).toBe('a b'));
});

describe('formatBytes', () => {
  it.each([[512, '512 B'], [2048, '2.0 KB'], [10_485_760, '10.0 MB']])('%i → %s', (n, s) => expect(formatBytes(n)).toBe(s));
});
