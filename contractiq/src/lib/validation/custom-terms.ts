import { z } from 'zod';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { CUSTOM_TERM_MAX, CUSTOM_TERM_MIN, CUSTOM_TERM_PATTERN, MAX_CUSTOM_TERMS } from '@/lib/constants';
import type { ContractType } from '@/types/domain';

// Custom term validation (04-term-preview-custom-terms.md §5.2). Used client- and server-side.
// The safe-character pattern is also the prompt-injection guard for term names.

/** Trim, and collapse any run of whitespace to a single space. */
export function normaliseTermName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export const CustomTermNameSchema = z
  .string()
  .transform(normaliseTermName)
  .pipe(
    z
      .string()
      .min(CUSTOM_TERM_MIN, `Use at least ${CUSTOM_TERM_MIN} characters.`)
      .max(CUSTOM_TERM_MAX, `Use at most ${CUSTOM_TERM_MAX} characters.`)
      .regex(CUSTOM_TERM_PATTERN, "Use letters, numbers, spaces and , . ' & ( ) / - only."),
  );

/** Full list schema; the duplicate checks depend on the contract type. */
export function makeCustomTermsSchema(contractType: ContractType) {
  const standardNames = new Set(TERM_LIBRARY[contractType].map((t) => t.name.toLowerCase()));
  return z
    .array(CustomTermNameSchema)
    .max(MAX_CUSTOM_TERMS, `You can add up to ${MAX_CUSTOM_TERMS} custom terms.`)
    .superRefine((terms, ctx) => {
      const seen = new Set<string>();
      terms.forEach((name, i) => {
        const lower = name.toLowerCase();
        if (standardNames.has(lower)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `"${name}" is already a standard term.` });
        }
        if (seen.has(lower)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `"${name}" is already in your list.` });
        }
        seen.add(lower);
      });
    });
}

export type CustomTermsInput = z.infer<ReturnType<typeof makeCustomTermsSchema>>;
