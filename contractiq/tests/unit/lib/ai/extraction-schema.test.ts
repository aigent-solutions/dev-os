import { describe, expect, it } from 'vitest';
import { buildExtractionResponseFormat, ExtractionResultSchema } from '@/lib/ai/extraction-schema';
import { MSA_FEW_SHOT } from '@/lib/ai/prompts/few-shot/msa';
import { NDA_FEW_SHOT } from '@/lib/ai/prompts/few-shot/nda';

// 05-key-term-extraction.md §12.
describe('buildExtractionResponseFormat', () => {
  it('puts exactly the requested keys in the term_key enum (strict schema)', () => {
    const keys = ['parties', 'governing_law', 'custom_audit_rights'];
    const f = buildExtractionResponseFormat(keys);
    expect(f.json_schema.strict).toBe(true);
    expect(f.json_schema.schema.properties.terms.items.properties.term_key.enum).toEqual(keys);
    expect(f.json_schema.schema.additionalProperties).toBe(false);
    expect(f.json_schema.schema.properties.terms.items.additionalProperties).toBe(false);
  });
});

describe('ExtractionResultSchema', () => {
  it.each([...NDA_FEW_SHOT, ...MSA_FEW_SHOT].map((ex) => [ex.id, ex]))('accepts few-shot %s', (_id, ex) => {
    expect(ExtractionResultSchema.safeParse(ex.expected).success).toBe(true);
  });

  it('rejects a term missing a required field', () => {
    expect(ExtractionResultSchema.safeParse({ detected_contract_type: 'nda', terms: [{ term_key: 'x', value: null }] }).success).toBe(false);
  });
});
