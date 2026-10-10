import { describe, expect, it } from 'vitest';
import { calibration, calibrationGate, extractionGates, outcomeFor, prf, type ExtractionMetrics, type TermRecord } from '../../../evals/lib/metrics';

// 15-evals.md §12.
describe('outcome table', () => {
  it.each([
    [true, 'x', true, 'TP'],
    [true, 'x', false, 'FP+FN'],
    [true, null, false, 'FN'],
    [false, null, false, 'TN'],
    [false, 'x', false, 'FP'],
  ] as const)('present=%s value=%s matched=%s → %s', (present, value, matched, out) => expect(outcomeFor(present, value, matched)).toBe(out));
});

describe('prf', () => {
  it('micro-averaged', () => expect(prf(['TP', 'TP', 'FP+FN', 'FN', 'TN'])).toMatchObject({ tp: 2, fp: 1, fn: 2, precision: 2 / 3, recall: 0.5 }));
  it('zero denominators → 0, not NaN', () => expect(prf(['TN', 'TN'])).toMatchObject({ precision: 0, recall: 0, f1: 0 }));
});

const rec = (over: Partial<TermRecord>): TermRecord => ({
  contract_id: 'c', contract_type: 'nda', jurisdiction: 'UK', source: 'cuad', term_key: 'k', term_name: 'K', is_custom: false, present: true,
  expected_value: 'x', expected_page: 1, acceptable_pages: [1], match_type: 'exact_normalised', ai_value: 'x', ai_page: 1, confidence: 90,
  source_verified: true, rules_match: true, judge: null, outcome: 'TP', outcome_judged: 'TP', errored: false, ...over,
});

describe('calibration', () => {
  it('ECE / MCE on a hand-computed 3-bucket fixture; buckets with n < 5 are excluded from MCE', () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) => rec({ confidence: 95, outcome: i < 9 ? 'TP' : 'FP+FN' })), // bucket 9: conf .95, acc .9 → gap .05
      ...Array.from({ length: 5 }, (_, i) => rec({ confidence: 55, outcome: i < 2 ? 'TP' : 'FP+FN' })), // bucket 5: conf .55, acc .4 → gap .15
      ...Array.from({ length: 2 }, () => rec({ confidence: 25, outcome: 'TP' })), // bucket 2: n = 2 (insufficient), gap .75
    ];
    const c = calibration(records);
    expect(c.n).toBe(17);
    expect(c.buckets[9]).toMatchObject({ n: 10, insufficient: false });
    expect(c.buckets[9]!.gap).toBeCloseTo(0.05, 9);
    expect(c.buckets[5]!.gap).toBeCloseTo(0.15, 9);
    expect(c.buckets[2]).toMatchObject({ n: 2, insufficient: true });
    expect(c.mce).toBeCloseTo(0.15, 9); // the 0.75 gap of the tiny bucket is ignored
    expect(c.ece).toBeCloseTo((10 * 0.05 + 5 * 0.15 + 2 * 0.75) / 17, 9);
    expect(calibrationGate(c).passed).toBe(false);
  });

  it('a null AI value counts as correct only when the term is absent', () => {
    const c = calibration([...Array.from({ length: 5 }, () => rec({ ai_value: null, present: false, outcome: 'TN', confidence: 5 }))]);
    expect(c.buckets[0]).toMatchObject({ n: 5, accuracy: 1 });
  });

  it('MCE ≤ 0.10 passes; between 0.10 and 0.15 warns', () => {
    expect(calibrationGate({ n: 1, ece: 0, mce: 0.1, buckets: [] })).toMatchObject({ passed: true, warning: false });
    expect(calibrationGate({ n: 1, ece: 0, mce: 0.12, buckets: [] })).toMatchObject({ passed: true, warning: true });
  });
});

describe('page accuracy', () => {
  it('only over TP outcomes', async () => {
    const { extractionMetrics } = await import('../../../evals/lib/metrics');
    const m = extractionMetrics({
      standard: [rec({ ai_page: 1 }), rec({ ai_page: 2 }), rec({ outcome: 'FP+FN', ai_page: 9 })],
      custom: null,
      runs: [{ contract_id: 'c', contract_type: 'nda', status: 'ok', cost_usd: 0.02, latency_ms: 1, attempts: 1 }],
      judged: false,
    });
    expect(m.page_accuracy).toEqual({ value: 0.5, n: 2 });
  });
});

describe('stage gates', () => {
  const metrics = (nda: number) => ({ f1: { nda: { f1: nda }, msa: null, all: { f1: nda } }, page_accuracy: { value: 1, n: 1 }, custom_f1: null, cost_usd: { mean: 0.1 }, latency_ms: { p95: 1 }, contracts: { errored: 0, invalid_output: 0 }, invalid_output_count: 0 }) as unknown as ExtractionMetrics;
  const nda = (f1: number, subset: 'full' | 'smoke' = 'full') => extractionGates(metrics(f1), { stage: 'beta', subset, mode: 'replay', customRan: false }).find((g) => g.name.startsWith('NDA'))!;
  it('beta: 0.81 fails, 0.82 passes', () => {
    expect(nda(0.81).passed).toBe(false);
    expect(nda(0.82).passed).toBe(true);
  });
  it('smoke relaxes the F1 gate by 0.05', () => expect(nda(0.78, 'smoke').passed).toBe(true));
});
