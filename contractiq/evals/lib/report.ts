// Report writers (15-evals.md §6.10): CSVs, per-term.json, summary.json and summary.md.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toCsv } from '@/lib/csv';
import type { Calibration, ChatMetrics, ChatResult, ExtractionMetrics, Gate, PRF, TermRecord } from './metrics';

export const EVAL_RESULTS_HEADER = [
  'Contract_ID',
  'Contract_Type',
  'Term_Name',
  'Expected_Value',
  'AI_Extracted_Value',
  'Expected_Page',
  'AI_Page',
  'Confidence_Score',
  'F1_Match',
  'Expert_Rating',
  'Notes',
];

export type RunInfo = {
  run_id: string;
  script: 'extraction' | 'calibration' | 'chat';
  mode: 'live' | 'replay' | 'record';
  subset: 'smoke' | 'full';
  stage: 'beta' | 'launch';
  prompt_version: string;
  model: string;
  git_sha: string;
};

export type Summary = RunInfo & {
  metrics: unknown;
  gates: Gate[];
  replay_misses: number;
  dataset_errors: string[];
  warnings: string[];
};

export function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export function writeFile(out: string, name: string, content: string): string {
  mkdirSync(out, { recursive: true });
  const file = path.join(out, name);
  writeFileSync(file, content);
  return file;
}
export const writeJson = (out: string, name: string, data: unknown) => writeFile(out, name, JSON.stringify(data, null, 2) + '\n');

/** The PRD evaluation spreadsheet (exact column order). */
export function evalResultsCsv(records: TermRecord[], info: Pick<RunInfo, 'prompt_version' | 'model'>, judged: boolean): string {
  return toCsv(
    EVAL_RESULTS_HEADER,
    records.map((r) => [
      r.contract_id,
      r.contract_type.toUpperCase(),
      r.is_custom ? `${r.term_name} (custom)` : r.term_name,
      r.present ? r.expected_value : '',
      r.ai_value ?? '',
      r.expected_page ?? '',
      r.ai_page ?? '',
      r.confidence,
      judged ? r.outcome_judged : r.outcome,
      '',
      [
        `match_type=${r.match_type ?? 'n/a'}`,
        `source_verified=${r.source_verified}`,
        `judge=${r.judge ? `llm:${r.judge}` : 'rules'}`,
        `prompt=${info.prompt_version}`,
        `model=${info.model}`,
        ...(r.errored ? ['contract_errored=true'] : []),
      ].join('; '),
    ]),
  );
}

export function calibrationCsv(c: Calibration): string {
  return toCsv(
    ['bucket', 'n', 'mean_confidence', 'accuracy', 'gap'],
    c.buckets.map((b) => [`${b.lo.toFixed(1)}-${b.hi.toFixed(1)}`, b.n, fix(b.mean_confidence), fix(b.accuracy), fix(b.gap)]),
  );
}

export function chatResultsCsv(results: ChatResult[]): string {
  return toCsv(
    ['id', 'contract_id', 'category', 'question', 'answer', 'cited_pages', 'is_not_found', 'passed', 'notes'],
    results.map((r) => [r.id, r.contract_id, r.category, r.question, r.answer, r.cited_pages.join(' '), r.is_not_found, r.passed, r.notes]),
  );
}

/** Monthly expert audit template: the SME fills in Rating and Notes. */
export function expertReviewCsv(results: ChatResult[]): string {
  return toCsv(
    ['Pair_ID', 'Contract_ID', 'Question', 'AI_Answer', 'Cited_Pages', 'Rating(Grounded|Hallucinated|Not found)', 'Notes'],
    results.filter((r) => !r.replay_miss && !r.errored).map((r) => [r.id, r.contract_id, r.question, r.answer, r.cited_pages.join(' '), '', '']),
  );
}

// ── summary.md ─────────────────────────────────────────────────────────────────

const fix = (x: number | null | undefined, dp = 4) => (x === null || x === undefined ? '' : x.toFixed(dp));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
const icon = (g: Gate) => (!g.passed ? '❌' : g.warning ? '⚠️' : '✅');
const showValue = (g: Gate) => (g.value === null ? '—' : Number.isInteger(g.value) ? String(g.value) : g.value.toFixed(4));

function header(s: Summary): string[] {
  return [
    `# ContractIQ eval — ${s.script}`,
    '',
    `Run \`${s.run_id}\` · mode **${s.mode}** · subset **${s.subset}** · stage **${s.stage}** · prompt \`${s.prompt_version}\` · model \`${s.model}\` · git \`${s.git_sha.slice(0, 7)}\``,
    '',
  ];
}

function gatesTable(gates: Gate[]): string[] {
  if (!gates.length) return [];
  return [
    '## Gates',
    '',
    '| | Gate | Value | Threshold | Note |',
    '|---|---|---|---|---|',
    ...gates.map((g) => `| ${icon(g)} | ${g.name} | ${showValue(g)} | ${g.threshold} | ${g.note ?? ''} |`),
    '',
  ];
}

function warnings(s: Summary): string[] {
  return s.warnings.length ? ['## Warnings', '', ...s.warnings.map((w) => `- ⚠️ ${w}`), ''] : [];
}

const prfRow = (label: string, p: PRF | null) =>
  p ? `| ${label} | ${p.f1.toFixed(3)} | ${p.precision.toFixed(3)} | ${p.recall.toFixed(3)} | ${p.tp} / ${p.fp} / ${p.fn} |` : `| ${label} | — | — | — | — |`;

export function calibrationTable(c: Calibration): string[] {
  return [
    `Samples ${c.n} · ECE ${fix(c.ece, 3) || '—'} · MCE ${fix(c.mce, 3) || '—'} (buckets with n ≥ 5)`,
    '',
    '```',
    'bucket     n    conf    acc     gap',
    ...c.buckets.map(
      (b) =>
        `${b.lo.toFixed(1)}-${b.hi.toFixed(1)}  ${String(b.n).padStart(4)}  ${b.mean_confidence === null ? '  —   ' : b.mean_confidence.toFixed(3)}   ${b.accuracy === null ? '  —   ' : b.accuracy.toFixed(3)}   ${
          b.gap === null ? '—' : b.gap.toFixed(3)
        }${b.insufficient && b.n > 0 ? '  (insufficient data)' : ''}`,
    ),
    '```',
    '',
  ];
}

export function extractionSummaryMd(s: Summary, m: ExtractionMetrics): string {
  const worst = Object.entries(m.by_term_key)
    .sort(([, a], [, b]) => a.f1 - b.f1)
    .slice(0, 10);
  const lines = [
    ...header(s),
    ...gatesTable(s.gates),
    ...warnings(s),
    '## Key-term F1',
    '',
    '| Set | F1 | Precision | Recall | TP / FP / FN |',
    '|---|---|---|---|---|',
    prfRow('NDA (rules)', m.f1.nda),
    prfRow('MSA (rules)', m.f1.msa),
    prfRow('All (rules)', m.f1.all),
    ...(m.f1_with_judge ? [prfRow('NDA (rules + judge)', m.f1_with_judge.nda), prfRow('MSA (rules + judge)', m.f1_with_judge.msa)] : []),
    ...(m.custom_f1 ? [prfRow('Custom terms', m.custom_f1)] : []),
    '',
    `Page accuracy ${pct(m.page_accuracy.value)} (over ${m.page_accuracy.n} TP) · coverage ${pct(m.coverage)} · contracts ${m.contracts.ok}/${m.contracts.total} ok, ${m.contracts.errored} errored, ${m.contracts.invalid_output} invalid output, ${m.contracts.replay_miss} replay misses${m.judge_misses ? ` · judge misses ${m.judge_misses}` : ''}`,
    '',
    '## Cost and latency (per analysis)',
    '',
    `Cost USD: mean ${fix(m.cost_usd.mean)} · P50 ${fix(m.cost_usd.p50)} · P95 ${fix(m.cost_usd.p95)} · max ${fix(m.cost_usd.max)} (gate ≤ 0.20; PRD all-in budget 0.25)`,
    '',
    `Latency: P50 ${m.latency_ms.p50 ?? '—'} ms · P95 ${m.latency_ms.p95 ?? '—'} ms${s.mode === 'replay' ? ' (recorded; not gated in replay)' : ''}`,
    '',
    '## Worst 10 terms by F1',
    '',
    '| Term | F1 | TP / FP / FN |',
    '|---|---|---|',
    ...worst.map(([k, p]) => `| ${k} | ${p.f1.toFixed(3)} | ${p.tp} / ${p.fp} / ${p.fn} |`),
    '',
    '## F1 by jurisdiction (fairness audit, report only)',
    '',
    '| Jurisdiction | F1 | n |',
    '|---|---|---|',
    ...Object.entries(m.by_jurisdiction).map(([k, p]) => `| ${k} | ${p.f1.toFixed(3)} | ${p.n} |`),
    '',
    '## F1 by source',
    '',
    '| Source | F1 | n |',
    '|---|---|---|',
    ...Object.entries(m.by_source).map(([k, p]) => `| ${k} | ${p.f1.toFixed(3)} | ${p.n} |`),
    '',
    '## Calibration (report only here; gated by the monthly calibration job)',
    '',
    ...calibrationTable(m.calibration),
  ];
  return lines.join('\n');
}

export function calibrationSummaryMd(s: Summary, c: Calibration, sourceRun: string): string {
  return [...header(s), ...gatesTable(s.gates), ...warnings(s), `Source run: \`${sourceRun}\``, '', '## Reliability table', '', ...calibrationTable(c)].join('\n');
}

export function chatSummaryMd(s: Summary, m: ChatMetrics, results: ChatResult[]): string {
  const failures = results.filter((r) => !r.passed && !r.replay_miss);
  return [
    ...header(s),
    ...gatesTable(s.gates),
    ...warnings(s),
    '## Groundedness',
    '',
    `Off-document "cannot find": ${m.off_document.passed}/${m.off_document.total} (${pct(m.off_document.rate)})`,
    '',
    `In-document cites a page: ${m.in_document.passed}/${m.in_document.total} (${pct(m.in_document.rate)})`,
    '',
    `Report only — expected page cited ${pct(m.in_document_expected_pages)} · expected content present ${pct(m.in_document_answer_contains)} · "Based on the document" prefix ${pct(m.based_on_prefix)} · total cost $${m.cost_usd_total.toFixed(4)}`,
    '',
    ...(failures.length ? ['## Failed items', '', '| Id | Category | Notes |', '|---|---|---|', ...failures.map((r) => `| ${r.id} | ${r.category} | ${r.notes} |`), ''] : []),
  ].join('\n');
}

/** Prints the gate table to the console. */
export function printGates(gates: Gate[]): void {
  for (const g of gates) console.log(`${icon(g)} ${g.name}: ${showValue(g)} (${g.threshold})${g.note ? ` — ${g.note}` : ''}`);
}
