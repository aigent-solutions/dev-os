import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEvalFixture } from '../../fixtures/evals/build';
import { runEval, tempDir } from '../../helpers/run-eval';

// 15-evals.md §12 — the extraction eval in replay mode: no network, deterministic metrics.
describe('run-extraction-eval --replay', () => {
  it('produces the precomputed metrics, the PRD CSV header, and exit 0 with --gate', () => {
    const data = tempDir('ciq-eval-data-');
    buildEvalFixture(data);
    const r = runEval('run-extraction-eval.ts', ['--replay', '--gate', '--data', data]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    const s = r.summary();
    expect(s.metrics.f1.nda.f1).toBeCloseTo(0.9, 6); // 9 TP, 1 FP+FN per NDA copy
    expect(s.metrics.f1.msa.f1).toBe(1);
    expect(s.metrics.page_accuracy.value).toBe(1);
    expect(s.metrics.cost_usd.mean).toBeCloseTo(0.023, 6);
    expect(s.metrics.contracts).toMatchObject({ total: 10, ok: 10, replay_miss: 0 });
    expect(s.replay_misses).toBe(0);
    const csv = r.read('eval-results.csv');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe('Contract_ID,Contract_Type,Term_Name,Expected_Value,AI_Extracted_Value,Expected_Page,AI_Page,Confidence_Score,F1_Match,Expert_Rating,Notes');
  }, 120_000);

  it('tampering one label changes F1 as expected (NDA 0.9 → 0.88)', () => {
    const data = tempDir('ciq-eval-data-');
    buildEvalFixture(data);
    // Make a correct NDA term wrong in one of the five copies: 45 TP → 44, FP and FN each +1.
    const file = path.join(data, 'nda/nda-fx-001/labels.json');
    const labels = JSON.parse(readFileSync(file, 'utf8')) as { terms: { term_key: string; expected_value: string }[] };
    labels.terms.find((t) => t.term_key === 'governing_law')!.expected_value = 'Scotland';
    writeFileSync(file, JSON.stringify(labels));
    const r = runEval('run-extraction-eval.ts', ['--replay', '--data', data]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(r.summary().metrics.f1.nda).toMatchObject({ tp: 44, fp: 6, fn: 6 });
    expect(r.summary().metrics.f1.nda.f1).toBeCloseTo(44 / 50, 6);
  }, 120_000);

  it('stale recordings (a changed contract text) → exit 3', () => {
    const data = tempDir('ciq-eval-data-');
    buildEvalFixture(data);
    const file = path.join(data, 'msa/msa-fx-001/contract.txt');
    writeFileSync(file, readFileSync(file, 'utf8') + '\n12. Counterparts. This Agreement may be signed in counterparts.\n');
    const r = runEval('run-extraction-eval.ts', ['--replay', '--data', data]);
    expect(r.code).toBe(3);
    expect(r.summary().replay_misses).toBe(1);
  }, 120_000);
});
