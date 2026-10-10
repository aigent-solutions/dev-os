import { describe, expect, it } from 'vitest';
import { buildRequestedTerms, customTermKey, TERM_LIBRARY } from '@/lib/ai/term-library';

// 04-term-preview-custom-terms.md §12.
describe('TERM_LIBRARY', () => {
  it('NDA has 10 terms and MSA 12', () => {
    expect(TERM_LIBRARY.nda).toHaveLength(10);
    expect(TERM_LIBRARY.msa).toHaveLength(12);
  });
  it.each(['nda', 'msa'] as const)('%s keys are unique snake_case; every entry has a description and a hint', (type) => {
    const keys = TERM_LIBRARY[type].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TERM_LIBRARY[type]) {
      expect(t.key).toMatch(/^[a-z_]+$/);
      expect(t.description?.trim().length, t.key).toBeGreaterThan(0);
      expect(t.extractionHint.trim().length, t.key).toBeGreaterThan(0);
    }
  });
});

describe('customTermKey', () => {
  it.each([
    ['Non-compete radius', 'custom_non_compete_radius'],
    ['競業避止', 'custom_term'],
    ['R&D (EU/UK)', 'custom_r_d_eu_uk'],
  ])('%s → %s', (name, key) => expect(customTermKey(name)).toBe(key));
});

describe('buildRequestedTerms', () => {
  it('standard terms first (displayOrder 1..n), custom after in input order with their ids', () => {
    const r = buildRequestedTerms('nda', [
      { id: 'a', term_name: 'Audit rights' },
      { id: 'b', term_name: 'Insurance' },
    ]);
    expect(r.map((t) => t.displayOrder)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(r.slice(0, 10).every((t) => !t.isCustom && t.customKeyTermId === null)).toBe(true);
    expect(r.slice(10).map((t) => [t.name, t.key, t.customKeyTermId, t.isCustom])).toEqual([
      ['Audit rights', 'custom_audit_rights', 'a', true],
      ['Insurance', 'custom_insurance', 'b', true],
    ]);
  });

  it('colliding keys get _2, _3 suffixes', () => {
    const r = buildRequestedTerms('msa', [
      { id: '1', term_name: 'Audit rights' },
      { id: '2', term_name: 'Audit-rights' },
      { id: '3', term_name: 'Audit (rights)' },
    ]);
    expect(r.filter((t) => t.isCustom).map((t) => t.key)).toEqual(['custom_audit_rights', 'custom_audit_rights_2', 'custom_audit_rights_3']);
  });
});
