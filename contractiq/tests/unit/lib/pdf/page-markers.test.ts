import { describe, expect, it } from 'vitest';
import { pageAtOffset, pageMarker, splitPages } from '@/lib/pdf/page-markers';

// 03-upload-extraction.md §12.
const TEXT = 'Preamble\n[PAGE 1]\nFirst page.\n[PAGE 2]\nSecond page.\n[PAGE 3]\nThird.';

describe('page markers', () => {
  it('splitPages round-trips with pageMarker', () => {
    const pages = splitPages(TEXT);
    expect(pages).toEqual([
      { page: 1, text: 'First page.' },
      { page: 2, text: 'Second page.' },
      { page: 3, text: 'Third.' },
    ]);
    const rebuilt = pages.map((p) => `${pageMarker(p.page)}\n${p.text}`).join('\n');
    expect(splitPages(rebuilt)).toEqual(pages);
  });

  it('pageAtOffset: before the first marker → null', () => expect(pageAtOffset(TEXT, 3)).toBeNull());
  it('pageAtOffset: inside page 2 → 2', () => expect(pageAtOffset(TEXT, TEXT.indexOf('Second'))).toBe(2));
  it('pageAtOffset: exactly at a marker index → that page', () => expect(pageAtOffset(TEXT, TEXT.indexOf('[PAGE 3]'))).toBe(3));
});
