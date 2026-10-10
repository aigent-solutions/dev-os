import type { ContractDetail } from '@/types/api';
import type { KeyTerm } from '@/types/domain';

// In-memory objects for component tests (no DB).
export function keyTerm(over: Partial<KeyTerm> = {}): KeyTerm {
  return {
    id: 't-1', term_key: 'governing_law', term_name: 'Governing Law', is_custom: false, value: 'England and Wales', page_number: 2,
    confidence_score: 90, source_sentence: 'This Agreement is governed by the laws of England and Wales.', source_verified: true,
    display_order: 1, is_edited: false, original_value: null, original_page_number: null, edited_at: null,
    ...over,
  } as KeyTerm;
}

export function contractDetail(over: Partial<ContractDetail['contract']> = {}, terms: KeyTerm[] = [keyTerm()]): ContractDetail {
  return {
    contract: {
      id: 'c-1', file_name: 'Acme NDA.pdf', contract_type: 'nda', detected_contract_type: 'nda', type_mismatch: false, status: 'completed',
      processing_stage: null, processing_attempts: 1, page_count: 3, contract_text: '[PAGE 1]\nx\n[PAGE 2]\ny\n[PAGE 3]\nz', error: null,
      created_at: '2026-10-01T00:00:00Z', review_completed_at: null, prompt_version: 'extraction-v1.0',
      ...over,
    },
    key_terms: terms,
    custom_terms: [],
    pdf_url: null,
    pdf_url_expires_at: null,
    feedback: null,
  } as unknown as ContractDetail;
}
