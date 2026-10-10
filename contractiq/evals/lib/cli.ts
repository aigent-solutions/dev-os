// Shared CLI plumbing for the eval scripts (15-evals.md §6.8). No `@/` imports: env-setup uses it.
import { parseArgs } from 'node:util';
import path from 'node:path';

export type EvalMode = 'live' | 'replay' | 'record';

export const EXIT = { PASS: 0, GATE_FAILED: 1, CONFIG_ERROR: 2, REPLAY_MISSES: 3 } as const;

/** Dataset or configuration problem → exit 2 (invalid labels, over-limit contract, missing env in live mode). */
export class ConfigError extends Error {
  constructor(
    message: string,
    public details: string[] = [],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type EvalArgs = {
  type: 'nda' | 'msa' | 'all';
  subset: 'smoke' | 'full';
  custom: boolean;
  mode: EvalMode;
  judge: 'rules' | 'llm';
  stage: 'beta' | 'launch';
  gate: boolean;
  concurrency: number;
  out: string;
  data: string;
  expertTemplate: boolean;
  allowReplayMisses: boolean;
  fresh: boolean;
  from: string | null;
};

/** contractiq/ — scripts run from the app root (npm run eval:*). */
export const APP_ROOT = path.resolve(__dirname, '..', '..');
export const EVALS_DIR = path.join(APP_ROOT, 'evals');

/** --live / --replay / --record, else EVAL_USE_LIVE_OPENAI (true → live, otherwise replay). */
export function resolveMode(argv: string[] = process.argv.slice(2)): EvalMode {
  const flags = (['live', 'replay', 'record'] as const).filter((m) => argv.includes(`--${m}`));
  if (flags.length > 1) throw new ConfigError(`Choose one of --live, --replay, --record (got ${flags.map((f) => `--${f}`).join(', ')})`);
  if (flags[0]) return flags[0];
  return process.env.EVAL_USE_LIVE_OPENAI === 'true' ? 'live' : 'replay';
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new ConfigError(`--${name} must be one of ${allowed.join(' | ')} (got "${value}")`);
  return value as T;
}

export function parseEvalArgs(argv: string[] = process.argv.slice(2)): EvalArgs {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        type: { type: 'string' },
        subset: { type: 'string' },
        custom: { type: 'boolean' },
        live: { type: 'boolean' },
        replay: { type: 'boolean' },
        record: { type: 'boolean' },
        judge: { type: 'string' },
        stage: { type: 'string' },
        gate: { type: 'boolean' },
        concurrency: { type: 'string' },
        out: { type: 'string' },
        data: { type: 'string' },
        'expert-template': { type: 'boolean' },
        'allow-replay-misses': { type: 'boolean' },
        fresh: { type: 'boolean' },
        from: { type: 'string' },
      },
    }));
  } catch (e) {
    throw new ConfigError((e as Error).message);
  }
  const concurrency = values.concurrency === undefined ? 4 : Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new ConfigError('--concurrency must be an integer 1–32');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    type: oneOf('type', values.type as string | undefined, ['nda', 'msa', 'all'] as const, 'all'),
    subset: oneOf('subset', values.subset as string | undefined, ['smoke', 'full'] as const, 'full'),
    custom: !!values.custom,
    mode: resolveMode(argv),
    judge: oneOf('judge', values.judge as string | undefined, ['rules', 'llm'] as const, 'rules'),
    stage: oneOf('stage', values.stage as string | undefined, ['beta', 'launch'] as const, 'beta'),
    gate: !!values.gate,
    concurrency,
    out: path.resolve(APP_ROOT, (values.out as string | undefined) ?? path.join('evals', 'reports', stamp)),
    data: path.resolve(APP_ROOT, (values.data as string | undefined) ?? path.join('evals', 'datasets')),
    expertTemplate: !!values['expert-template'],
    allowReplayMisses: !!values['allow-replay-misses'],
    fresh: !!values.fresh,
    from: values.from ? path.resolve(APP_ROOT, values.from as string) : null,
  };
}

/** Runs `items` through `fn` with at most `n` in flight; results keep input order. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Entry point wrapper: maps ConfigError → exit 2 and any other crash → exit 2 with the stack. */
export function runMain(main: () => Promise<number>): void {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      if (err instanceof ConfigError) {
        console.error(`\n✖ ${err.message}`);
        for (const d of err.details) console.error(`  - ${d}`);
      } else {
        console.error('\n✖ Eval crashed:', err);
      }
      process.exitCode = EXIT.CONFIG_ERROR;
    },
  );
}
