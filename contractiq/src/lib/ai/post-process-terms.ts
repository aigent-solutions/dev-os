import { MAX_TERM_VALUE_CHARS, UNVERIFIED_CONFIDENCE_CAP } from '@/lib/constants';
import type { ExtractionResult } from './extraction-schema';
import { verifySourceSentence } from './source-verification';
import type { RequestedTerm } from './term-library';

// Server-side guardrails on model output (05 §6.5, engineering-doc §8.4 rules a–f).
// Output keys match the save_extraction_results p_terms contract.
export type ProcessedTerm = {
  term_key: string;
  term_name: string;
  is_custom: boolean;
  custom_key_term_id: string | null;
  value: string | null;
  page_number: number | null;
  confidence_score: number;
  source_sentence: string | null;
  source_verified: boolean;
  display_order: number;
};

const MAX_SOURCE_CHARS = 1_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

export function postProcessTerms(p: {
  requested: RequestedTerm[];
  modelTerms: ExtractionResult['terms'];
  contractText: string;
  pageCount: number;
}): ProcessedTerm[] {
  // a. First occurrence of each key wins; keys that weren't requested are dropped.
  const byKey = new Map<string, ExtractionResult['terms'][number]>();
  for (const t of p.modelTerms) if (!byKey.has(t.term_key)) byKey.set(t.term_key, t);

  return [...p.requested]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((r) => {
      const m = byKey.get(r.key) ?? { value: null, page_number: null, confidence: 0, source_sentence: null };
      let value = m.value?.trim() || null;
      if (value) value = truncate(value, MAX_TERM_VALUE_CHARS);
      let source = m.source_sentence?.trim() || null;
      if (source) source = truncate(source, MAX_SOURCE_CHARS);

      // b. Confidence 0..1 → 0..100.
      let conf = Number.isFinite(m.confidence) ? Math.round(clamp(m.confidence, 0, 1) * 100) : 0;
      let page: number | null = m.page_number;
      let verified = false;

      // c. Verified source: its page wins. Unverified: cap below 50 (forces ⚠️).
      if (source) {
        const v = verifySourceSentence(p.contractText, source);
        if (v.found) {
          verified = true;
          page = v.page;
        } else {
          conf = Math.min(conf, UNVERIFIED_CONFIDENCE_CAP);
        }
      }
      // d. A value with no supporting sentence is unreliable.
      if (value !== null && source === null) conf = Math.min(conf, UNVERIFIED_CONFIDENCE_CAP);
      // e. Out-of-range page (only possible when unverified).
      if (!verified && page !== null && (!Number.isInteger(page) || page < 1 || page > p.pageCount)) {
        page = null;
        conf = Math.min(conf, UNVERIFIED_CONFIDENCE_CAP);
      }
      // A term that isn't found has no page; its source is kept only if verified.
      if (value === null) {
        page = null;
        if (!verified) source = null;
      }

      return {
        term_key: r.key,
        term_name: r.name,
        is_custom: r.isCustom,
        custom_key_term_id: r.customKeyTermId,
        value,
        page_number: page,
        confidence_score: conf,
        source_sentence: source,
        source_verified: verified,
        display_order: r.displayOrder,
      };
    });
}
