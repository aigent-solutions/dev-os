import { z } from 'zod';

// Auth form validation (01-auth.md §6.2). Shared by the forms; Supabase enforces the same
// password rules server-side (min 8, letters + digits).
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email')
  .email('Enter a valid email address')
  .max(254);

export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use 72 characters or fewer') // bcrypt limit
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const SignupSchema = z.object({ email: EmailSchema, password: PasswordSchema });
// Login doesn't apply the strength rules, so older accounts can still sign in if the rules change.
export const LoginSchema = z.object({ email: EmailSchema, password: z.string().min(1, 'Enter your password') });

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
