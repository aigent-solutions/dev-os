import { z } from 'zod';
import { MAX_FEEDBACK_COMMENT } from '@/lib/constants';

// PUT /api/contracts/{id}/feedback (11 §5). Full replace: omitted comment / accuracy_rating are stored as null.
export const FeedbackSchema = z
  .object({
    rating: z.enum(['up', 'down']),
    comment: z
      .string()
      .trim()
      .max(MAX_FEEDBACK_COMMENT, `Comment must be ${MAX_FEEDBACK_COMMENT} characters or fewer`)
      .optional()
      .transform((v) => (v ? v : null)), // '' → null
    accuracy_rating: z
      .enum(['yes', 'partially', 'no'])
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .strict();
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
