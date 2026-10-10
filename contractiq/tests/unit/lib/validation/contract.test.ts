import { describe, expect, it } from 'vitest';
import { CreateContractSchema, ProcessContractBodySchema } from '@/lib/validation/contract';

// 03-upload-extraction.md §12.
const ok = (file_name: string) => CreateContractSchema.safeParse({ file_name, file_size: 1000, contract_type: 'nda' }).success;

describe('CreateContractSchema', () => {
  it('accepts .pdf in any case', () => {
    expect(ok('contract.pdf')).toBe(true);
    expect(ok('CONTRACT.PDF')).toBe(true);
  });
  it('rejects .pdf.exe and other extensions', () => {
    expect(ok('contract.pdf.exe')).toBe(false);
    expect(ok('contract.docx')).toBe(false);
  });
  it('255 characters ok, 256 rejected', () => {
    expect(ok('a'.repeat(251) + '.pdf')).toBe(true);
    expect(ok('a'.repeat(252) + '.pdf')).toBe(false);
  });
  it('rejects an unknown contract type and a zero size', () => {
    expect(CreateContractSchema.safeParse({ file_name: 'a.pdf', file_size: 1, contract_type: 'sow' }).success).toBe(false);
    expect(CreateContractSchema.safeParse({ file_name: 'a.pdf', file_size: 0, contract_type: 'nda' }).success).toBe(false);
  });
});

describe('ProcessContractBodySchema', () => {
  it('defaults custom_terms to [] and caps it at 5', () => {
    expect(ProcessContractBodySchema.parse({})).toEqual({ custom_terms: [] });
    expect(ProcessContractBodySchema.safeParse({ custom_terms: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
  });
});
