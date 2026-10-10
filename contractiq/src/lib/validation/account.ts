import { z } from 'zod';

// PATCH /api/account (13 §5.2). Strict: plan, email, trial_ends_at etc. are rejected with 400.
export const UpdateProfileSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .max(120, 'Name must be 120 characters or fewer')
      .transform((v) => (v ? v : null)) // '' → null
      .nullable()
      .optional(),
    feedback_opt_in: z.boolean().optional(),
    onboarding_completed: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// The settings form only edits the name. .refine() above makes .pick() unavailable, so it is separate.
export const ProfileNameFormSchema = z.object({
  full_name: z.string().trim().max(120, 'Name must be 120 characters or fewer'),
});
export type ProfileNameFormInput = z.infer<typeof ProfileNameFormSchema>;

// DELETE /api/account (13 §5.3).
export const DeleteAccountSchema = z.object({ confirm: z.literal('DELETE') }).strict();
