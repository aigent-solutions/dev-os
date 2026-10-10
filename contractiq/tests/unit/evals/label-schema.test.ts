import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExtractionDataset } from '../../../evals/lib/load-dataset';
import { ConfigError } from '../../../evals/lib/cli';
import { NDA_TEXT } from '../../fixtures/evals/build';
import { TERM_LIBRARY } from '@/lib/ai/term-library';

// 15-evals.md §12 — label validation; every problem is reported as a dataset error (exit 2).
const absent = (k: string) => ({ term_key: k, present: false });
const validTerms = () => TERM_LIBRARY.nda.map((t) => (t.key === 'governing_law' ? { term_key: t.key, present: true, expected_value: 'England and Wales', match_type: 'exact_normalised', expected_page: 2 } : absent(t.key)));

function dataset(terms: unknown[], over: Record<string, unknown> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ciq-labels-'));
  mkdirSync(path.join(dir, 'nda/nda-x-001'), { recursive: true });
  writeFileSync(path.join(dir, 'nda/nda-x-001/contract.txt'), NDA_TEXT);
  writeFileSync(path.join(dir, 'nda/nda-x-001/labels.json'), JSON.stringify({ contract_id: 'nda-x-001', contract_type: 'nda', jurisdiction: 'UK', source: 'cuad', document: { text: 'contract.txt' }, page_count: 2, terms, ...over }));
  writeFileSync(path.join(dir, 'subsets.json'), JSON.stringify({ smoke: ['nda-x-001'], full: 'all' }));
  return loadExtractionDataset({ dataDir: dir, type: 'all', subset: 'full' });
}
const problems = async (p: Promise<unknown>) => {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(ConfigError);
  return (e as ConfigError).details.join('\n');
};

describe('labels.json validation', () => {
  it('a valid fixture loads, with acceptable_pages defaulted', async () => {
    const [c] = await dataset(validTerms());
    expect(c!.labels.find((l) => l.term_key === 'governing_law')).toMatchObject({ acceptable_pages: [2] });
  });

  it('a missing standard key is named', async () => {
    expect(await problems(dataset(validTerms().filter((t) => t.term_key !== 'parties')))).toMatch(/missing standard term key "parties"/);
  });

  it('present: false with extra fields fails', async () => {
    const terms = validTerms().map((t) => (t.term_key === 'parties' ? { ...t, expected_value: 'x' } : t));
    expect(await problems(dataset(terms))).toMatch(/nda-x-001\/labels\.json/);
  });

  it('a page outside 1..page_count fails', async () => {
    const terms = validTerms().map((t) => (t.term_key === 'governing_law' ? { ...t, expected_page: 7 } : t));
    expect(await problems(dataset(terms))).toMatch(/page 7 is outside 1\.\.2/);
  });

  it('semantic requires required_elements; jurisdiction must match the pattern', async () => {
    const terms = validTerms().map((t) => (t.term_key === 'governing_law' ? { ...t, match_type: 'semantic' } : t));
    expect(await problems(dataset(terms))).toMatch(/required_elements/);
    expect(await problems(dataset(validTerms(), { jurisdiction: 'England' }))).toMatch(/jurisdiction/);
  });
});
