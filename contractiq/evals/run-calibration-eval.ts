// Confidence calibration: 10 buckets, ECE (report) and MCE over buckets with n ≥ 5 (gate) (15-evals.md §6.9.4).
// Reads per-term.json from the latest full extraction run (or --from <dir>); --fresh runs a new one first.
// npm run eval:calibration -- [--fresh] [--from dir] [--live|--replay|--record] [--gate] [--out dir] [--data dir]
import { assertEvalEnv } from './lib/env-setup';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError, EVALS_DIR, EXIT, parseEvalArgs, runMain } from './lib/cli';
import { extractionConfig, runExtractionEval } from './lib/extraction-run';
import { calibration, calibrationGate, type TermRecord } from './lib/metrics';
import { calibrationCsv, calibrationSummaryMd, gitSha, printGates, writeFile, writeJson, type Summary } from './lib/report';

/** Newest report dir whose summary.json is a full extraction run with a per-term.json. */
function latestFullRun(reportsDir: string): string | null {
  if (!existsSync(reportsDir)) return null;
  const dirs = readdirSync(reportsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(reportsDir, d.name))
    .sort()
    .reverse();
  for (const dir of dirs) {
    try {
      const s = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as Summary;
      if (s.script === 'extraction' && s.subset === 'full' && existsSync(path.join(dir, 'per-term.json'))) return dir;
    } catch {
      // not a run directory
    }
  }
  return null;
}

runMain(async () => {
  const args = parseEvalArgs();
  assertEvalEnv();
  if (args.subset === 'smoke') throw new ConfigError('Calibration does not apply to the smoke subset (15 §6.9.6)');

  let records: TermRecord[];
  let source: string;
  let mode = args.mode;
  let promptVersion: string;
  let model: string;
  if (args.fresh) {
    const run = await runExtractionEval({ ...args, custom: false, gate: false, subset: 'full', out: path.join(args.out, 'extraction') });
    if (run.summary.replay_misses) throw new ConfigError(`Fresh extraction had ${run.summary.replay_misses} replay misses; calibration needs a complete run`);
    records = run.records;
    source = run.summary.run_id;
    ({ prompt_version: promptVersion, model } = run.summary);
  } else {
    const dir = args.from ?? latestFullRun(path.join(EVALS_DIR, 'reports'));
    if (!dir) throw new ConfigError('No full extraction run found; run eval:extraction first, pass --from <dir>, or use --fresh');
    const s = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as Summary;
    if (s.subset !== 'full') throw new ConfigError(`${dir} is a ${s.subset} run; calibration needs a full run`);
    records = JSON.parse(readFileSync(path.join(dir, 'per-term.json'), 'utf8')) as TermRecord[];
    source = dir;
    mode = s.mode;
    ({ prompt_version: promptVersion, model } = s);
  }
  if (!promptVersion) ({ promptVersion, model } = extractionConfig());

  const c = calibration(records);
  const gate = calibrationGate(c);
  const summary: Summary = {
    run_id: path.basename(args.out),
    script: 'calibration',
    mode,
    subset: 'full',
    stage: args.stage,
    prompt_version: promptVersion,
    model,
    git_sha: gitSha(),
    metrics: { calibration: c, source_run: source },
    gates: [gate],
    replay_misses: 0,
    dataset_errors: [],
    warnings: gate.warning ? [`MCE ${c.mce?.toFixed(3)} is between 0.10 and 0.15 — watch the trend`] : [],
  };
  writeFile(args.out, 'calibration.csv', calibrationCsv(c));
  writeJson(args.out, 'summary.json', summary);
  writeFile(args.out, 'summary.md', calibrationSummaryMd(summary, c, source));
  printGates([gate]);
  console.log(`Reports: ${args.out}`);
  return args.gate && !gate.passed ? EXIT.GATE_FAILED : EXIT.PASS;
});
