// Must be the first import in every eval script (15-evals.md §6.3). Loads .env.local the same way the
// app does (@next/env, so inline comments and blanks parse identically) and fills placeholders for the
// variables src/lib/env.ts requires but evals never use. No `@/` imports here.
import { loadEnvConfig } from '@next/env';
import { APP_ROOT, ConfigError, resolveMode, type EvalMode } from './cli';

loadEnvConfig(APP_ROOT, true, { info: () => undefined, error: console.error });

const unset = (k: string) => !process.env[k]?.trim();
const placeholder = (k: string, v: string) => {
  if (unset(k)) process.env[k] = v;
};

placeholder('SUPABASE_SERVICE_ROLE_KEY', 'eval-placeholder-service-role-key');
placeholder('NEXT_PUBLIC_SUPABASE_URL', 'http://eval.invalid');
placeholder('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eval-placeholder-anon-key');
placeholder('INTERNAL_FUNCTION_SECRET', 'x'.repeat(32));
placeholder('OPENAI_USER_HASH_SALT', 'e'.repeat(32));
// The spec suggests 0, but env.ts requires a positive budget; evals never read it.
placeholder('OPENAI_MONTHLY_BUDGET_USD', '1');
placeholder('NEXT_PUBLIC_APP_URL', 'http://eval.invalid');

let mode: EvalMode | null = null;
let modeError: string | null = null;
try {
  mode = resolveMode();
} catch (e) {
  modeError = (e as Error).message;
}
// Replay never touches the network, so any syntactically valid key will do.
const realKeyMissing = unset('OPENAI_API_KEY') || process.env.OPENAI_API_KEY === 'sk-replay';
if (mode === 'replay') placeholder('OPENAI_API_KEY', 'sk-replay');

/** Call at the start of main(): throws ConfigError (exit 2) before any work starts. */
export function assertEvalEnv(): void {
  const problems: string[] = [];
  if (modeError) problems.push(modeError);
  if ((mode === 'live' || mode === 'record') && realKeyMissing) problems.push(`OPENAI_API_KEY is required in ${mode} mode`);
  for (const k of ['OPENAI_PRICE_INPUT_PER_MTOK', 'OPENAI_PRICE_OUTPUT_PER_MTOK']) {
    if (unset(k)) problems.push(`${k} is required (it drives the cost metric and gate)`);
  }
  if (problems.length) throw new ConfigError('Eval configuration error', problems);
}
