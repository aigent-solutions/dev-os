import { describe, expect, it } from 'vitest';
import { EVAL_RESULTS_HEADER, evalResultsCsv } from '../../../evals/lib/report';
import type { TermRecord } from '../../../evals/lib/metrics';

// 15-evals.md §12 — the PRD evaluation spreadsheet.
const rec = (over: Partial<TermRecord> = {}): TermRecord => ({
  contract_id: 'nda-001', contract_type: 'nda', jurisdiction: 'UK', source: 'cuad', term_key: 'k', term_name: 'Governing Law', is_custom: false, present: true,
  expected_value: 'England', expected_page: 2, acceptable_pages: [2], match_type: 'exact_normalised', ai_value: 'England', ai_page: 2, confidence: 90,
  source_verified: true, rules_match: true, judge: null, outcome: 'TP', outcome_judged: 'TP', errored: false, ...over,
});
const csv = (records: TermRecord[]) => evalResultsCsv(records, { prompt_version: 'extraction-v1.0', model: 'gpt-4o' }, false);

describe('eval-results.csv', () => {
  it('exact header, BOM, CRLF line endings', () => {
    const out = csv([rec()]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1).split('\r\n')[0]).toBe(EVAL_RESULTS_HEADER.join(','));
    expect(EVAL_RESULTS_HEADER.join(',')).toBe('Contract_ID,Contract_Type,Term_Name,Expected_Value,AI_Extracted_Value,Expected_Page,AI_Page,Confidence_Score,F1_Match,Expert_Rating,Notes');
    expect(out.endsWith('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(out)).toBe(false);
  });

  it('guards against CSV injection (=SUM(…)) and quotes commas', () => {
    const out = csv([rec({ ai_value: '=SUM(A1:A9)', expected_value: 'a, b' })]);
    expect(out).toContain(`'=SUM(A1:A9)`);
    expect(out).toContain('"a, b"');
  });

  it('custom terms are suffixed; notes carry match type, verification, prompt and model', () => {
    const line = csv([rec({ is_custom: true, term_name: 'Audit rights' })]).split('\r\n')[1]!;
    expect(line).toContain('Audit rights (custom)');
    expect(line).toContain('match_type=exact_normalised; source_verified=true; judge=rules; prompt=extraction-v1.0; model=gpt-4o');
  });
});
