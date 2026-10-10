import { describe, expect, it } from 'vitest';
import { postProcessTerms } from '@/lib/ai/post-process-terms';
import { buildRequestedTerms } from '@/lib/ai/term-library';
import type { ExtractionResult } from '@/lib/ai/extraction-schema';

// 05-key-term-extraction.md §12 — server-side guardrails on model output (engineering-doc §8.4 a–f).
const TEXT = '[PAGE 1]\nThis Agreement is governed by the laws of England and Wales.\n[PAGE 2]\nEither party may terminate on 30 days written notice.';
const GOV = 'This Agreement is governed by the laws of England and Wales.';
const requested = buildRequestedTerms('nda', [
  { id: 'c-1', term_name: 'Audit rights' },
  { id: 'c-2', term_name: 'Insurance' },
]);
type ModelTerm = ExtractionResult['terms'][number];
const term = (key: string, over: Partial<ModelTerm> = {}): ModelTerm => ({ term_key: key, value: 'x', page_number: 1, confidence: 0.9, source_sentence: GOV, ...over });
const run = (modelTerms: ModelTerm[], pageCount = 2) => postProcessTerms({ requested, modelTerms, contractText: TEXT, pageCount });
const get = (out: ReturnType<typeof run>, key: string) => out.find((t) => t.term_key === key)!;

describe('postProcessTerms', () => {
  it('returns exactly the requested terms in display order, filling missing ones', () => {
    const out = run([term('governing_law')]);
    expect(out.map((t) => t.term_key)).toEqual(requested.map((r) => r.key));
    expect(out.map((t) => t.display_order)).toEqual(requested.map((r) => r.displayOrder));
    const missing = get(out, 'parties');
    expect(missing).toMatchObject({ value: null, page_number: null, confidence_score: 0, source_sentence: null, source_verified: false });
  });

  it('drops unknown keys and keeps the first of duplicate keys', () => {
    const out = run([term('not_requested'), term('governing_law', { value: 'first' }), term('governing_law', { value: 'second' })]);
    expect(out.some((t) => t.term_key === 'not_requested')).toBe(false);
    expect(get(out, 'governing_law').value).toBe('first');
  });

  it.each([
    [-0.2, 0],
    [1.3, 100],
    [NaN, 0],
    [Infinity, 0],
    [0.555, 56],
  ])('confidence %d → %d', (confidence, expected) => {
    expect(get(run([term('governing_law', { confidence })]), 'governing_law').confidence_score).toBe(expected);
  });

  it('a verified source keeps its confidence and sets the page from the text', () => {
    const t = get(run([term('governing_law', { page_number: 2 })]), 'governing_law');
    expect(t).toMatchObject({ source_verified: true, page_number: 1, confidence_score: 90 }); // model said 2; text says 1
  });

  it('an unverified (fabricated) source is capped at 49', () => {
    const t = get(run([term('governing_law', { source_sentence: 'The laws of Mars govern this Agreement entirely.' })]), 'governing_law');
    expect(t).toMatchObject({ source_verified: false, confidence_score: 49 });
  });

  it('a value with no source sentence is capped at 49', () => {
    expect(get(run([term('governing_law', { source_sentence: null })]), 'governing_law').confidence_score).toBe(49);
  });

  it('a low confidence is never raised by the cap', () => {
    expect(get(run([term('governing_law', { source_sentence: null, confidence: 0.2 })]), 'governing_law').confidence_score).toBe(20);
  });

  it.each([0, 3, 1.5])('an out-of-range page (%d, unverified) → null and capped', (page_number) => {
    const t = get(run([term('governing_law', { source_sentence: null, page_number })]), 'governing_law');
    expect(t).toMatchObject({ page_number: null, confidence_score: 49 });
  });

  it('a null value has no page, and an unverified source is dropped', () => {
    const t = get(run([term('governing_law', { value: null, page_number: 1, source_sentence: 'Not in the contract at all, honestly.' })]), 'governing_law');
    expect(t).toMatchObject({ value: null, page_number: null, source_sentence: null });
  });

  it('whitespace-only values and sources become null', () => {
    const t = get(run([term('governing_law', { value: '   ', source_sentence: '  ' })]), 'governing_law');
    expect(t).toMatchObject({ value: null, source_sentence: null });
  });

  it('passes custom_key_term_id through for custom terms', () => {
    const out = run([]);
    const custom = out.filter((t) => t.is_custom);
    expect(custom.map((t) => [t.term_name, t.custom_key_term_id])).toEqual([
      ['Audit rights', 'c-1'],
      ['Insurance', 'c-2'],
    ]);
    expect(out.filter((t) => !t.is_custom).every((t) => t.custom_key_term_id === null)).toBe(true);
  });

  it('truncates values at 2,000 and sources at 1,000 characters (with an ellipsis)', () => {
    const t = get(run([term('governing_law', { value: 'v'.repeat(2500), source_sentence: GOV + ' ' + 's'.repeat(1500) })]), 'governing_law');
    expect(t.value).toHaveLength(2000);
    expect(t.value!.endsWith('…')).toBe(true);
    expect(t.source_sentence).toHaveLength(1000);
  });
});
