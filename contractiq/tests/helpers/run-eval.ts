import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = path.join(__dirname, '../..');

/** Runs an eval CLI exactly as `npm run eval:*` does (child process), returning its exit code and summary. */
export function runEval(script: 'run-extraction-eval.ts' | 'run-chat-groundedness.ts', args: string[]) {
  const out = mkdtempSync(path.join(tmpdir(), 'ciq-eval-out-'));
  const res = spawnSync('npx', ['tsx', `evals/${script}`, '--out', out, ...args], {
    cwd: APP,
    env: { ...process.env, NODE_OPTIONS: '--conditions=react-server', EVAL_USE_LIVE_OPENAI: 'false' },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const read = (name: string) => readFileSync(path.join(out, name), 'utf8');
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, out, read, summary: () => JSON.parse(read('summary.json')) };
}

export const tempDir = (prefix: string) => mkdtempSync(path.join(tmpdir(), prefix));
