// The extraction eval run (15-evals.md §6.8), shared by run-extraction-eval.ts and
// run-calibration-eval.ts --fresh. Calls the app's own AI functions; never the DB-bound services.
import path from 'node:path';
import { callExtractionModel, ExtractionError, type Usage } from '@/lib/ai/extraction';
import { buildExtractionResponseFormat } from '@/lib/ai/extraction-schema';
import { postProcessTerms, type ProcessedTerm } from '@/lib/ai/post-process-terms';
import { calculateCostUsd } from '@/lib/ai/pricing';
import { getExtractionPrompt } from '@/lib/ai/prompts';
import { buildRequestedTerms, TERM_LIBRARY } from '@/lib/ai/term-library';
import { MAX_CUSTOM_TERMS } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { ConfigError, EXIT, pool, type EvalArgs } from './cli';
import { JUDGE_MODEL, judgeSemantic } from './judge';
import { loadCustomTermDataset, loadExtractionDataset, type EvalContract, type TermLabel } from './load-dataset';
import { matchTerm } from './match';
import { extractionGates, extractionMetrics, outcomeFor, type ContractRun, type ExtractionMetrics, type TermRecord } from './metrics';
import { createEvalClient, evalCallStats } from './openai-eval-client';
import { evalResultsCsv, extractionSummaryMd, gitSha, printGates, writeFile, writeJson, type Summary } from './report';

const log = createLogger({ service: 'contractiq-evals' });

export type ExtractionRunResult = { summary: Summary; metrics: ExtractionMetrics; records: TermRecord[]; exitCode: number };

/** Active prompt version + model, read the same way the app reads them. Unknown version → exit 2. */
export function extractionConfig(): { promptVersion: string; model: string } {
  try {
    const promptVersion = serverEnv.EXTRACTION_PROMPT_VERSION;
    getExtractionPrompt(promptVersion);
    return { promptVersion, model: serverEnv.OPENAI_EXTRACTION_MODEL };
  } catch (e) {
    throw new ConfigError((e as Error).message);
  }
}

export const recordingsDir = (dataDir: string) => path.join(dataDir, 'recordings');

type CallOutcome = { status: ContractRun['status']; terms: ProcessedTerm[] | null; costUsd: number; latencyMs: number | null; attempts: number; error?: string };

const cost = (u: Usage | undefined) => (u ? calculateCostUsd(u.promptTokens, u.completionTokens) : 0);

/** One extraction exactly as the app runs it: buildRequestedTerms → prompt → callExtractionModel → postProcessTerms. */
async function extract(contract: EvalContract, custom: { id: string; term_name: string }[], args: EvalArgs, cfg: { promptVersion: string; model: string }): Promise<CallOutcome> {
  if (custom.length > MAX_CUSTOM_TERMS) throw new Error(`Never send more than ${MAX_CUSTOM_TERMS} custom terms in one call`);
  const client = createEvalClient(args.mode, { ...cfg, recordingsDir: recordingsDir(args.data) });
  const requested = buildRequestedTerms(contract.contract_type, custom);
  const messages = getExtractionPrompt(cfg.promptVersion).buildMessages({ contractType: contract.contract_type, terms: requested, contractText: contract.text });
  const started = Date.now();
  try {
    const call = await callExtractionModel({
      messages,
      responseFormat: buildExtractionResponseFormat(requested.map((t) => t.key)),
      userId: 'eval',
      log: log.child({ contract_id: contract.contract_id }),
      client,
    });
    const terms = postProcessTerms({ requested, modelTerms: call.result.terms, contractText: contract.text, pageCount: contract.page_count });
    const recorded = evalCallStats(client).calls.reduce((s, c) => s + c.latencyMs, 0);
    return {
      status: 'ok',
      terms,
      costUsd: cost(call.usage) + cost(call.repairUsage),
      latencyMs: args.mode === 'replay' ? recorded : Date.now() - started,
      attempts: call.attempts,
    };
  } catch (err) {
    const stats = evalCallStats(client);
    if (stats.misses.length) return { status: 'replay_miss', terms: null, costUsd: 0, latencyMs: null, attempts: 0, error: `replay miss ${stats.misses[0]}` };
    if (err instanceof ExtractionError) {
      return {
        status: err.code === 'INVALID_AI_OUTPUT' ? 'invalid_output' : 'errored',
        terms: null,
        costUsd: cost(err.usage),
        latencyMs: null,
        attempts: err.attempts,
        error: err.code,
      };
    }
    throw err;
  }
}

/** Compares post-processed terms with labels (§6.6) → per-term records. */
async function score(
  contract: EvalContract,
  items: { label: TermLabel; termKey: string; termName: string; isCustom: boolean; find: (t: ProcessedTerm) => boolean }[],
  terms: ProcessedTerm[] | null,
  args: EvalArgs,
  cfg: { promptVersion: string },
): Promise<TermRecord[]> {
  const judgeClient = args.judge === 'llm' ? createEvalClient(args.mode, { promptVersion: cfg.promptVersion, model: JUDGE_MODEL, recordingsDir: recordingsDir(args.data) }) : null;
  const out: TermRecord[] = [];
  for (const it of items) {
    const t = terms?.find(it.find) ?? null;
    const aiValue = t?.value ?? null;
    const label = it.label;
    const rules = label.present && aiValue !== null ? matchTerm(label, aiValue, { jurisdiction: contract.jurisdiction }) : null;
    let judge: TermRecord['judge'] = null;
    if (judgeClient && label.present && label.match_type === 'semantic' && aiValue !== null && rules === false) {
      judge = await judgeSemantic(judgeClient, { termName: it.termName, label, aiValue });
    }
    out.push({
      contract_id: contract.contract_id,
      contract_type: contract.contract_type,
      jurisdiction: contract.jurisdiction,
      source: contract.source,
      term_key: it.termKey,
      term_name: it.termName,
      is_custom: it.isCustom,
      present: label.present,
      expected_value: label.present ? label.expected_value : null,
      expected_page: label.present ? label.expected_page : null,
      acceptable_pages: label.present ? label.acceptable_pages : [],
      match_type: label.present ? label.match_type : null,
      ai_value: aiValue,
      ai_page: t?.page_number ?? null,
      confidence: t?.confidence_score ?? 0,
      source_verified: t?.source_verified ?? false,
      rules_match: rules,
      judge,
      outcome: outcomeFor(label.present, aiValue, rules === true),
      outcome_judged: outcomeFor(label.present, aiValue, rules === true || judge === 'YES'),
      errored: terms === null,
    });
  }
  return out;
}

export async function runExtractionEval(args: EvalArgs): Promise<ExtractionRunResult> {
  const cfg = extractionConfig();
  const contracts = await loadExtractionDataset({ dataDir: args.data, type: args.type, subset: args.subset });
  const custom = args.custom ? await loadCustomTermDataset({ dataDir: args.data, type: args.type, subset: args.subset }) : null;
  console.log(`Extraction eval: ${contracts.length} contracts · mode ${args.mode} · prompt ${cfg.promptVersion} · model ${cfg.model}`);

  // Standard terms: one call per contract.
  const runs: ContractRun[] = [];
  const standardNested = await pool(contracts, args.concurrency, async (c) => {
    const r = await extract(c, [], args, cfg);
    runs.push({ contract_id: c.contract_id, contract_type: c.contract_type, status: r.status, cost_usd: r.costUsd, latency_ms: r.latencyMs, attempts: r.attempts, error: r.error });
    console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${c.contract_id} ${r.status}${r.error ? ` (${r.error})` : ''}`);
    if (r.status === 'replay_miss') return [];
    const names = new Map(TERM_LIBRARY[c.contract_type].map((t) => [t.key, t.name]));
    const items = c.labels.map((label) => ({
      label,
      termKey: label.term_key,
      termName: names.get(label.term_key) ?? label.term_key,
      isCustom: false,
      find: (t: ProcessedTerm) => t.term_key === label.term_key && !t.is_custom,
    }));
    return score(c, items, r.terms, args, cfg);
  });
  const standard = standardNested.flat();

  // Custom terms: two passes of 5 per contract; only the custom results count (§6.7).
  let customRecords: TermRecord[] | null = null;
  let customMisses = 0;
  if (custom) {
    const passes = custom.flatMap((cc) => {
      const chunks: { cc: typeof cc; names: string[]; offset: number }[] = [];
      for (let i = 0; i < cc.terms.length; i += MAX_CUSTOM_TERMS) chunks.push({ cc, names: cc.terms.slice(i, i + MAX_CUSTOM_TERMS), offset: i });
      return chunks;
    });
    console.log(`Custom-term eval: ${custom.length} contracts × ${passes.length / Math.max(1, custom.length)} passes`);
    const nested = await pool(passes, args.concurrency, async ({ cc, names, offset }) => {
      const customTerms = names.map((term_name, i) => ({ id: `eval-custom-${offset + i + 1}`, term_name }));
      const r = await extract(cc.contract, customTerms, args, cfg);
      if (r.status === 'replay_miss') {
        customMisses++;
        return [];
      }
      const items = customTerms.map((ct) => {
        const label = cc.labels.find((l) => l.term_name === ct.term_name)!;
        return { label, termKey: ct.id, termName: ct.term_name, isCustom: true, find: (t: ProcessedTerm) => t.custom_key_term_id === ct.id };
      });
      return score(cc.contract, items, r.terms, args, cfg);
    });
    customRecords = nested.flat();
  }

  const metrics = extractionMetrics({ standard, custom: customRecords, runs, judged: args.judge === 'llm' });
  const replayMisses = metrics.contracts.replay_miss + customMisses;
  const gates = extractionGates(metrics, { stage: args.stage, subset: args.subset, mode: args.mode, customRan: !!custom });
  const warnings: string[] = [];
  if (replayMisses) {
    warnings.push(
      args.allowReplayMisses
        ? `${replayMisses} replay misses — recordings stale; the live job covers this change`
        : `${replayMisses} replay misses — re-record with --record (exit 3)`,
    );
  }
  if (args.judge === 'llm' && metrics.judge_misses) warnings.push(`${metrics.judge_misses} judge calls had no recording or failed; counted as NO`);

  const summary: Summary = {
    run_id: path.basename(args.out),
    script: 'extraction',
    mode: args.mode,
    subset: args.subset,
    stage: args.stage,
    prompt_version: cfg.promptVersion,
    model: cfg.model,
    git_sha: gitSha(),
    metrics,
    gates,
    replay_misses: replayMisses,
    dataset_errors: [],
    warnings,
  };
  const records = [...standard, ...(customRecords ?? [])];
  writeFile(args.out, 'eval-results.csv', evalResultsCsv(records, summary, args.judge === 'llm'));
  writeJson(args.out, 'per-term.json', records);
  writeJson(args.out, 'summary.json', summary);
  writeFile(args.out, 'summary.md', extractionSummaryMd(summary, metrics));

  printGates(gates);
  for (const w of warnings) console.log(`⚠️ ${w}`);
  console.log(`Reports: ${args.out}`);

  let exitCode: number = EXIT.PASS;
  if (args.mode === 'replay' && replayMisses && !args.allowReplayMisses) exitCode = EXIT.REPLAY_MISSES;
  else if (args.gate && gates.some((g) => !g.passed)) exitCode = EXIT.GATE_FAILED;
  return { summary, metrics, records, exitCode };
}
