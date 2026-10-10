import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/api/errors';
import { assertPdfBuffer } from '@/lib/pdf/validate-pdf';

// 03-upload-extraction.md §12.
const code = (buf: Buffer) => {
  try {
    assertPdfBuffer(buf);
    return 'ok';
  } catch (e) {
    return (e as AppError).code;
  }
};
const pdfOfSize = (n: number) => Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(n - 5)]);

describe('assertPdfBuffer', () => {
  it('accepts the %PDF- magic bytes', () => expect(code(Buffer.from('%PDF-1.7\n...'))).toBe('ok'));
  it.each([['plain text', 'hello world'], ['a PNG', '\x89PNG\r\n'], ['too short', '%PD'], ['empty', '']])('rejects %s → NOT_A_PDF', (_l, s) => {
    expect(code(Buffer.from(s, 'latin1'))).toBe('NOT_A_PDF');
  });
  it('10,485,760 bytes is allowed; 10,485,761 → FILE_TOO_LARGE', () => {
    expect(code(pdfOfSize(10_485_760))).toBe('ok');
    expect(code(pdfOfSize(10_485_761))).toBe('FILE_TOO_LARGE');
  });
});
