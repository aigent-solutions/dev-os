import '@/lib/server-guard'; // not 'server-only': env is loaded by Netlify functions and evals (00-foundation.md §6.12)
import { z } from 'zod';
import { CHAT_PROMPT_VERSIONS, EXTRACTION_PROMPT_VERSIONS } from '@/lib/ai/prompts/versions';
import { formatIssues } from '@/lib/env.public';

const num = (def: number, min = 0) =>
  z.coerce
    .number()
    .min(min)
    .optional()
    .transform((v) => v ?? def);

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  OPENAI_EXTRACTION_MODEL: z.string().min(1).default('gpt-4o'),
  OPENAI_CHAT_MODEL: z.string().min(1).default('gpt-4o'),
  OPENAI_PRICE_INPUT_PER_MTOK: z.coerce.number().positive(),
  OPENAI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().positive(),
  OPENAI_USER_HASH_SALT: z.string().min(32),
  OPENAI_MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  // An unknown version fails at boot, never at runtime (05 §6.7).
  EXTRACTION_PROMPT_VERSION: z.enum(EXTRACTION_PROMPT_VERSIONS).default('extraction-v1.0'),
  CHAT_PROMPT_VERSION: z.enum(CHAT_PROMPT_VERSIONS).default('chat-v1.0'),
  CHAT_MAX_INPUT_TOKENS: num(100_000, 1_000),
  PROCESSING_MODE: z.enum(['background', 'sync']).default('background'),
  PROCESSING_SYNC_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SYNC_PROCESSING_BUDGET_MS: num(24_000, 5_000),
  INTERNAL_FUNCTION_SECRET: z.string().min(32),
  SITE_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/$/, '')),
  COMMIT_REF: z.string().default('dev'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** '' → undefined, so a blank line copied from .env.example falls back to the default. */
export function emptyToUndefined(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]));
}

export function parseServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const source = emptyToUndefined(env);
  const result = ServerEnvSchema.safeParse({
    ...source,
    SITE_URL: source.URL ?? source.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) throw new Error(`Invalid environment: ${formatIssues(result.error)}`);
  return result.data;
}

let cached: ServerEnv | undefined;

/**
 * Parsed on first property access rather than at import time, so `next build` (which imports
 * route modules) does not need server secrets. The first server request that reads a value
 * still fails loudly with "Invalid environment: <field>" (00-foundation.md §10).
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    cached ??= parseServerEnv();
    return cached[prop as keyof ServerEnv];
  },
});
