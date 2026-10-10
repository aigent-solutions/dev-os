import { z } from 'zod';

// 05-key-term-extraction.md §6.4. The strict JSON schema is built per request so term_key is an enum
// of the requested keys only. Ranges are enforced in post-processing (clamping), not here, so a
// slightly-out-of-range confidence doesn't trigger a repair.
export function buildExtractionResponseFormat(termKeys: string[]) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'contract_key_terms',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['detected_contract_type', 'terms'],
        properties: {
          detected_contract_type: { type: 'string', enum: ['nda', 'msa', 'other'] },
          terms: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['term_key', 'value', 'page_number', 'confidence', 'source_sentence'],
              properties: {
                term_key: { type: 'string', enum: termKeys },
                value: { type: ['string', 'null'] },
                page_number: { type: ['integer', 'null'] },
                confidence: { type: 'number' },
                source_sentence: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  };
}
export type ExtractionResponseFormat = ReturnType<typeof buildExtractionResponseFormat>;

export const ModelTermSchema = z.object({
  term_key: z.string().min(1),
  value: z.string().nullable(),
  page_number: z.number().int().nullable(),
  confidence: z.number().finite(),
  source_sentence: z.string().nullable(),
});

export const ExtractionResultSchema = z.object({
  detected_contract_type: z.enum(['nda', 'msa', 'other']),
  terms: z.array(ModelTermSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
