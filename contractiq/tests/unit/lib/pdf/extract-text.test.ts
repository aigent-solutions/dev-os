import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/api/errors';
import { countWords, extractPdfText, normaliseExtractedText } from '@/lib/pdf/extract-text';

// 03-upload-extraction.md §12 — real pdf.js on generated fixtures (tests/fixtures/pdfs/generate.ts).
const fixture = (name: string) => readFileSync(path.join(__dirname, '../../../fixtures/pdfs', name));
const codeOf = async (name: string) => {
  const e = await extractPdfText(fixture(name)).catch((err: unknown) => err);
  expect(e).toBeInstanceOf(AppError);
  return e as AppError;
};

describe('extractPdfText', () => {
  it('a 3-page NDA → [PAGE 1]–[PAGE 3] in order, pageCount 3, > 100 words', async () => {
    const r = await extractPdfText(fixture('nda-3p.pdf'));
    expect(r.pageCount).toBe(3);
    expect(r.wordCount).toBeGreaterThan(100);
    expect([...r.text.matchAll(/\[PAGE (\d+)\]/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
    expect(r.text).toContain('This Agreement is governed by the laws of England and Wales');
  });

  it('a blank middle page still gets its marker', async () => {
    const r = await extractPdfText(fixture('blank-middle-3p.pdf'));
    expect([...r.text.matchAll(/\[PAGE (\d+)\]/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
  });

  it('a scanned page (no text layer) → wordCount < 100', async () => {
    expect((await extractPdfText(fixture('scanned-1p.pdf'))).wordCount).toBeLessThan(100);
  });

  it('a password-protected PDF → PDF_ENCRYPTED', async () => expect((await codeOf('encrypted.pdf')).code).toBe('PDF_ENCRYPTED'));
  it('a corrupt PDF → PDF_UNREADABLE', async () => expect((await codeOf('corrupt.pdf')).code).toBe('PDF_UNREADABLE'));
  it('21 pages → TOO_MANY_PAGES with page_count 21', async () => {
    const e = await codeOf('msa-21p.pdf');
    expect(e.code).toBe('TOO_MANY_PAGES');
    expect(e.details).toEqual({ page_count: 21 });
    expect(e.userMessage).toContain('21 pages');
  });

  it('parsing one document after another gives the same result (no cross-document state)', async () => {
    const a = await extractPdfText(fixture('nda-3p.pdf'));
    await extractPdfText(fixture('blank-middle-3p.pdf'));
    expect((await extractPdfText(fixture('nda-3p.pdf'))).text).toBe(a.text);
  });
});

describe('normaliseExtractedText', () => {
  it('removes NULs and soft hyphens, normalises CRLF, trims trailing spaces, collapses blank runs', () => {
    expect(normaliseExtractedText('a\u0000b con­tract \r\nline2\r\n\r\n\r\n\r\nline3  \n')).toBe('ab contract\nline2\n\nline3');
  });
});

describe('countWords', () => {
  it('excludes page markers and punctuation-only tokens', () => {
    expect(countWords('[PAGE 1]\nHello, world — this is 1 test. ... §\n[PAGE 2]\nend')).toBe(7);
  });
});
