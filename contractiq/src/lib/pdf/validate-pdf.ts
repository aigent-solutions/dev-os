import { appError } from '@/lib/api/errors';
import { MAX_FILE_BYTES } from '@/lib/constants';

/** Size limit and the %PDF- magic bytes (03-upload-extraction.md §6.4). */
export function assertPdfBuffer(buf: Buffer): void {
  if (buf.length > MAX_FILE_BYTES) throw appError('FILE_TOO_LARGE');
  if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw appError('NOT_A_PDF');
}
