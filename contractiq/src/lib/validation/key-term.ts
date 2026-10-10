import { z } from 'zod';
import { MAX_PAGES, MAX_TERM_VALUE_CHARS } from '@/lib/constants';

// PATCH /api/key-terms/{id} (08 §5). Users can't clear a value back to null: "Not found" only comes from
// the AI. The page upper bound (the contract's page_count) is checked against the parent contract.
export const KeyTermUpdateSchema = z
  .object({
    value: z
      .string()
      .trim()
      .min(1, "Value can't be empty")
      .max(MAX_TERM_VALUE_CHARS, `Value must be ${MAX_TERM_VALUE_CHARS} characters or fewer`),
    page_number: z.number().int().min(1, 'Page must be 1 or higher').max(MAX_PAGES).nullable().optional(),
  })
  .strict();
export type KeyTermUpdateInput = z.infer<typeof KeyTermUpdateSchema>;
