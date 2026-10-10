import { z } from 'zod';

// Safe for client bundles. Each NEXT_PUBLIC_* var is referenced literally because Next.js inlines
// them at build time; spreading process.env does not work client-side (00-foundation.md §6.2).
const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true'));

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/$/, '')),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SHOW_CALIBRATION_WARNING: bool(false),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

function parsePublicEnv(): PublicEnv {
  const result = PublicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    NEXT_PUBLIC_SHOW_CALIBRATION_WARNING: process.env.NEXT_PUBLIC_SHOW_CALIBRATION_WARNING || undefined,
  });
  if (!result.success) throw new Error(`Invalid environment: ${formatIssues(result.error)}`);
  return result.data;
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
}

export const publicEnv = parsePublicEnv();
