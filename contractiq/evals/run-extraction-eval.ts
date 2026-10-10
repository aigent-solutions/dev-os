// Key-term extraction eval: F1, page accuracy, custom-term F1, cost and latency (15-evals.md §6.8–6.9).
// npm run eval:extraction -- [--type nda|msa|all] [--subset smoke|full] [--custom] [--live|--replay|--record]
//                            [--judge rules|llm] [--stage beta|launch] [--gate] [--concurrency N] [--out dir] [--data dir]
//                            [--allow-replay-misses]
import { assertEvalEnv } from './lib/env-setup';
import { parseEvalArgs, runMain } from './lib/cli';
import { runExtractionEval } from './lib/extraction-run';

runMain(async () => {
  const args = parseEvalArgs();
  assertEvalEnv();
  return (await runExtractionEval(args)).exitCode;
});
