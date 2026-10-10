// Metrics and gates (15-evals.md §6.9).
import type { JudgeVerdict } from './judge';
import type { MatchType } from './load-dataset';

export type Outcome = 'TP' | 'FP' | 'FN' | 'TN' | 'FP+FN';

/** One labelled term after extraction + post-processing (written to per-term.json). */
export type TermRecord = {
  contract_id: string;
  contract_type: 'nda' | 'msa';
  jurisdiction: string;
  source: string;
  term_key: string;
  term_name: string;
  is_custom: boolean;
  present: boolean;
  expected_value: string | null;
  expected_page: number | null;
  acceptable_pages: number[];
  match_type: MatchType | null;
  ai_value: string | null;
  ai_page: number | null;
  confidence: number;
  source_verified: boolean;
  /** null when not compared (no AI value or label absent). */
  rules_match: boolean | null;
  judge: JudgeVerdict | null;
  outcome: Outcome;
  outcome_judged: Outcome;
  /** The contract's model call failed: present terms count as FN. */
  errored: boolean;
};

export type ContractStatus = 'ok' | 'errored' | 'invalid_output' | 'replay_miss';
export type ContractRun = {
  contract_id: string;
  contract_type: 'nda' | 'msa';
  status: ContractStatus;
  cost_usd: number;
  latency_ms: number | null;
  attempts: number;
  error?: string;
};

/** §6.9.1 outcome table. */
export function outcomeFor(present: boolean, aiValue: string | null, matched: boolean): Outcome {
  if (present) return aiValue === null ? 'FN' : matched ? 'TP' : 'FP+FN';
  return aiValue === null ? 'TN' : 'FP';
}

export type PRF = { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number; n: number };

/** Micro-averaged precision / recall / F1. F1 is 0 when P + R = 0. */
export function prf(outcomes: Outcome[]): PRF {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const o of outcomes) {
    if (o === 'TP') tp++;
    if (o === 'FP' || o === 'FP+FN') fp++;
    if (o === 'FN' || o === 'FP+FN') fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn, n: outcomes.length };
}

/** Nearest-rank percentile; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function groupPrf(records: TermRecord[], key: (r: TermRecord) => string): Record<string, PRF> {
  const groups = new Map<string, Outcome[]>();
  for (const r of records) groups.set(key(r), [...(groups.get(key(r)) ?? []), r.outcome]);
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, os]) => [k, prf(os)]));
}

// ── Calibration (§6.9.4) ───────────────────────────────────────────────────────

export type CalibrationBucket = { bucket: number; lo: number; hi: number; n: number; mean_confidence: number | null; accuracy: number | null; gap: number | null; insufficient: boolean };
export type Calibration = { n: number; ece: number | null; mce: number | null; buckets: CalibrationBucket[] };

export const CALIBRATION_MIN_BUCKET = 5;

/** Samples: post-processed standard terms (confidence as users see it). y = TP, or null value for an absent term. */
export function calibration(records: TermRecord[]): Calibration {
  const samples = records
    .filter((r) => !r.is_custom && !r.errored)
    .map((r) => ({ c: r.confidence / 100, y: r.ai_value === null ? (r.present ? 0 : 1) : r.outcome === 'TP' ? 1 : 0 }));
  const buckets: CalibrationBucket[] = Array.from({ length: 10 }, (_, b) => {
    const inBucket = samples.filter((s) => (b === 9 ? s.c >= 0.9 : s.c >= b / 10 && s.c < (b + 1) / 10));
    const conf = mean(inBucket.map((s) => s.c));
    const acc = mean(inBucket.map((s) => s.y));
    return {
      bucket: b,
      lo: b / 10,
      hi: (b + 1) / 10,
      n: inBucket.length,
      mean_confidence: conf,
      accuracy: acc,
      gap: conf === null || acc === null ? null : Math.abs(acc - conf),
      insufficient: inBucket.length < CALIBRATION_MIN_BUCKET,
    };
  });
  const N = samples.length;
  const ece = N ? buckets.reduce((sum, b) => sum + (b.gap === null ? 0 : (b.n / N) * b.gap), 0) : null;
  const gated = buckets.filter((b) => !b.insufficient && b.gap !== null).map((b) => b.gap!);
  return { n: N, ece, mce: gated.length ? Math.max(...gated) : null, buckets };
}

// ── Extraction metrics (§6.9.1–6.9.3) ──────────────────────────────────────────

export type ExtractionMetrics = {
  f1: { nda: PRF | null; msa: PRF | null; all: PRF };
  f1_with_judge: { nda: PRF | null; msa: PRF | null; all: PRF } | null;
  by_term_key: Record<string, PRF>;
  by_jurisdiction: Record<string, PRF>;
  by_source: Record<string, PRF>;
  coverage: number | null;
  page_accuracy: { value: number | null; n: number };
  custom_f1: PRF | null;
  cost_usd: { mean: number | null; p50: number | null; p95: number | null; max: number | null; n: number };
  latency_ms: { p50: number | null; p95: number | null; n: number };
  contracts: Record<ContractStatus | 'total', number>;
  invalid_output_count: number;
  judge_misses: number;
  calibration: Calibration;
};

export function extractionMetrics(p: { standard: TermRecord[]; custom: TermRecord[] | null; runs: ContractRun[]; judged: boolean }): ExtractionMetrics {
  const byType = (records: TermRecord[], pick: (r: TermRecord) => Outcome) => {
    const of = (t: 'nda' | 'msa') => {
      const os = records.filter((r) => r.contract_type === t).map(pick);
      return os.length ? prf(os) : null;
    };
    return { nda: of('nda'), msa: of('msa'), all: prf(records.map(pick)) };
  };
  const present = p.standard.filter((r) => r.present);
  const tps = p.standard.filter((r) => r.outcome === 'TP');
  const counted = p.runs.filter((r) => r.status !== 'replay_miss');
  const costs = counted.map((r) => r.cost_usd);
  const latencies = counted.filter((r) => r.status === 'ok' && r.latency_ms !== null).map((r) => r.latency_ms!);
  const count = (s: ContractStatus) => p.runs.filter((r) => r.status === s).length;
  return {
    f1: byType(p.standard, (r) => r.outcome),
    f1_with_judge: p.judged ? byType(p.standard, (r) => r.outcome_judged) : null,
    by_term_key: groupPrf(p.standard, (r) => `${r.contract_type}:${r.term_key}`),
    by_jurisdiction: groupPrf(p.standard, (r) => r.jurisdiction),
    by_source: groupPrf(p.standard, (r) => r.source),
    coverage: present.length ? present.filter((r) => r.ai_value !== null).length / present.length : null,
    page_accuracy: { value: tps.length ? tps.filter((r) => r.ai_page !== null && r.acceptable_pages.includes(r.ai_page)).length / tps.length : null, n: tps.length },
    custom_f1: p.custom ? prf(p.custom.map((r) => r.outcome)) : null,
    cost_usd: { mean: mean(costs), p50: percentile(costs, 50), p95: percentile(costs, 95), max: costs.length ? Math.max(...costs) : null, n: costs.length },
    latency_ms: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), n: latencies.length },
    contracts: { total: p.runs.length, ok: count('ok'), errored: count('errored'), invalid_output: count('invalid_output'), replay_miss: count('replay_miss') },
    invalid_output_count: count('invalid_output'),
    judge_misses: [...p.standard, ...(p.custom ?? [])].filter((r) => r.judge === 'MISS').length,
    calibration: calibration(p.standard),
  };
}

// ── Gates (§6.9.6) ─────────────────────────────────────────────────────────────

export type Gate = { name: string; value: number | null; threshold: string; passed: boolean; warning?: boolean; note?: string };
export type Stage = 'beta' | 'launch';

export const THRESHOLDS = {
  beta: { nda_f1: 0.82, msa_f1: 0.82, latency_p95_ms: 45_000 },
  launch: { nda_f1: 0.88, msa_f1: 0.85, latency_p95_ms: 30_000 },
  page_accuracy: 0.92,
  custom_f1: 0.8,
  mean_cost_usd: 0.2,
  all_in_budget_usd: 0.25,
  smoke_f1_relaxation: 0.05,
  chat_off_document: 1,
  chat_in_document: 0.95,
  mce_pass: 0.1,
  mce_fail: 0.15,
} as const;

const atLeast = (name: string, value: number | null, min: number, note?: string): Gate => ({
  name,
  value,
  threshold: `≥ ${min}`,
  passed: value !== null && value >= min - 1e-9,
  note: value === null ? 'no data' : note,
});
const atMost = (name: string, value: number | null, max: number, note?: string): Gate => ({
  name,
  value,
  threshold: `≤ ${max}`,
  passed: value !== null && value <= max + 1e-9,
  note: value === null ? 'no data' : note,
});

/** Extraction gates. F1 gates use rules-only F1. Smoke relaxes F1 by 0.05 and skips custom; latency only when the run hit the API. */
export function extractionGates(m: ExtractionMetrics, o: { stage: Stage; subset: 'smoke' | 'full'; mode: 'live' | 'replay' | 'record'; customRan: boolean }): Gate[] {
  const t = THRESHOLDS[o.stage];
  const relax = o.subset === 'smoke' ? THRESHOLDS.smoke_f1_relaxation : 0;
  const note = relax ? `smoke subset: relaxed by ${relax}` : undefined;
  const round = (x: number) => Math.round(x * 100) / 100;
  const gates: Gate[] = [];
  if (m.f1.nda) gates.push(atLeast('NDA F1 (rules)', m.f1.nda.f1, round(t.nda_f1 - relax), note));
  if (m.f1.msa) gates.push(atLeast('MSA F1 (rules)', m.f1.msa.f1, round(t.msa_f1 - relax), note));
  gates.push(atLeast('Page accuracy', m.page_accuracy.value, THRESHOLDS.page_accuracy));
  if (o.customRan && o.subset === 'full') gates.push(atLeast('Custom-term F1', m.custom_f1?.f1 ?? null, THRESHOLDS.custom_f1));
  gates.push(atMost('Mean extraction cost (USD)', m.cost_usd.mean, THRESHOLDS.mean_cost_usd, `PRD all-in budget $${THRESHOLDS.all_in_budget_usd}`));
  if (o.mode !== 'replay') gates.push(atMost('P95 latency (ms)', m.latency_ms.p95, t.latency_p95_ms));
  const failed = m.contracts.errored + m.contracts.invalid_output;
  gates.push({
    name: 'Contracts errored',
    value: failed,
    threshold: '= 0',
    passed: failed === 0,
    note: failed ? `${failed} contracts errored (${m.invalid_output_count} invalid AI output)` : undefined,
  });
  return gates;
}

/** MCE ≤ 0.10 passes; 0.10–0.15 passes with a warning; ≥ 0.15 fails. */
export function calibrationGate(c: Calibration): Gate {
  const v = c.mce;
  if (v === null) return { name: 'Calibration MCE', value: null, threshold: `< ${THRESHOLDS.mce_fail}`, passed: false, note: 'no bucket has n ≥ 5' };
  const failed = v >= THRESHOLDS.mce_fail;
  return {
    name: 'Calibration MCE',
    value: v,
    threshold: `< ${THRESHOLDS.mce_fail} (pass ≤ ${THRESHOLDS.mce_pass})`,
    passed: !failed,
    warning: !failed && v > THRESHOLDS.mce_pass,
    note: failed ? 'Set NEXT_PUBLIC_SHOW_CALIBRATION_WARNING=true in Netlify (engineering-doc §8.8).' : undefined,
  };
}

// ── Chat (§6.9.5) ──────────────────────────────────────────────────────────────

export type ChatResult = {
  id: string;
  contract_id: string;
  category: 'off_document' | 'in_document';
  question: string;
  answer: string;
  cited_pages: number[];
  is_not_found: boolean;
  passed: boolean;
  expected_pages_hit: boolean | null;
  answer_contains_ok: boolean | null;
  based_on_prefix: boolean | null;
  errored: boolean;
  replay_miss: boolean;
  cost_usd: number;
  notes: string;
};

export type ChatMetrics = {
  off_document: { passed: number; total: number; rate: number | null };
  in_document: { passed: number; total: number; rate: number | null };
  in_document_expected_pages: number | null;
  in_document_answer_contains: number | null;
  based_on_prefix: number | null;
  errored: number;
  replay_misses: number;
  cost_usd_total: number;
};

const rate = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);

export function chatMetrics(results: ChatResult[]): ChatMetrics {
  const scored = results.filter((r) => !r.replay_miss);
  const of = (c: ChatResult['category']) => {
    const xs = scored.filter((r) => r.category === c);
    return { passed: xs.filter((r) => r.passed).length, total: xs.length, rate: rate(xs.map((r) => r.passed)) };
  };
  const inDoc = scored.filter((r) => r.category === 'in_document' && !r.errored);
  return {
    off_document: of('off_document'),
    in_document: of('in_document'),
    in_document_expected_pages: rate(inDoc.map((r) => !!r.expected_pages_hit)),
    in_document_answer_contains: rate(inDoc.filter((r) => r.answer_contains_ok !== null).map((r) => !!r.answer_contains_ok)),
    based_on_prefix: rate(scored.filter((r) => r.based_on_prefix !== null).map((r) => !!r.based_on_prefix)),
    errored: scored.filter((r) => r.errored).length,
    replay_misses: results.length - scored.length,
    cost_usd_total: results.reduce((s, r) => s + r.cost_usd, 0),
  };
}

export function chatGates(m: ChatMetrics): Gate[] {
  return [
    atLeast('Chat off-document "cannot find"', m.off_document.rate, THRESHOLDS.chat_off_document, `${m.off_document.passed}/${m.off_document.total}`),
    atLeast('Chat in-document cites a page', m.in_document.rate, THRESHOLDS.chat_in_document, `${m.in_document.passed}/${m.in_document.total}`),
    { name: 'Chat answers errored', value: m.errored, threshold: '= 0', passed: m.errored === 0 },
  ];
}
