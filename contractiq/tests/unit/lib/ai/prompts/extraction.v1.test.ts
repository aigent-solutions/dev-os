import { describe, expect, it } from 'vitest';
import { verifySourceSentence } from '@/lib/ai/source-verification';
import { buildMessages, PROMPT_VERSION } from '@/lib/ai/prompts/extraction.v1';
import { MSA_FEW_SHOT } from '@/lib/ai/prompts/few-shot/msa';
import { NDA_FEW_SHOT } from '@/lib/ai/prompts/few-shot/nda';
import { buildRequestedTerms, TERM_LIBRARY } from '@/lib/ai/term-library';

// 05-key-term-extraction.md §12 — prompt drift is caught by the snapshot; few-shots must be self-consistent.
const TEXT = '[PAGE 1]\nThis Agreement is governed by the laws of England and Wales.';

describe(`extraction prompt ${PROMPT_VERSION}`, () => {
  it('matches the snapshot for an NDA with 2 custom terms', () => {
    const terms = buildRequestedTerms('nda', [
      { id: 'c1', term_name: 'Audit rights' },
      { id: 'c2', term_name: 'Insurance requirements' },
    ]);
    expect(buildMessages({ contractType: 'nda', terms, contractText: TEXT })).toMatchSnapshot();
  });

  it.each(['nda', 'msa'] as const)('%s: system, 3 example pairs, then the contract (wrapped in <contract type>)', (type) => {
    const msgs = buildMessages({ contractType: type, terms: buildRequestedTerms(type, []), contractText: TEXT });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
    expect(String(msgs.at(-1)!.content)).toContain(`<contract type="${type}">\n${TEXT}\n</contract>`);
  });

  it('the contract text is only ever in the last user message, never the system prompt', () => {
    const msgs = buildMessages({ contractType: 'nda', terms: buildRequestedTerms('nda', []), contractText: 'UNIQUE-CONTRACT-MARKER 123456' });
    expect(msgs.filter((m) => String(m.content).includes('UNIQUE-CONTRACT-MARKER'))).toHaveLength(1);
    expect(String(msgs[0]!.content)).not.toContain('UNIQUE-CONTRACT-MARKER');
  });

  describe.each([
    ['nda', NDA_FEW_SHOT],
    ['msa', MSA_FEW_SHOT],
  ] as const)('%s few-shots', (type, examples) => {
    it('has 3 examples', () => expect(examples).toHaveLength(3));

    it.each(examples.map((e) => [e.id, e]))('%s covers every standard key exactly once', (_id, ex) => {
      expect(ex.expected.terms.map((t) => t.term_key).sort()).toEqual(TERM_LIBRARY[type].map((t) => t.key).sort());
    });

    it.each(examples.map((e) => [e.id, e]))('%s: every source_sentence verifies against its excerpt, on the stated page', (_id, ex) => {
      for (const t of ex.expected.terms.filter((t) => t.source_sentence)) {
        const v = verifySourceSentence(ex.excerpt, t.source_sentence!);
        expect(v.found, `${t.term_key}: ${t.source_sentence}`).toBe(true);
        expect(v.page, t.term_key).toBe(t.page_number);
      }
    });
  });
});
