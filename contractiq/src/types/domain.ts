import { CONFIDENCE_HIGH, CONFIDENCE_LOW } from '@/lib/constants';

// Domain types — docs/specs/README.md §3.6.
export type ContractType = 'nda' | 'msa';
export type DetectedContractType = 'nda' | 'msa' | 'other';
export type ContractStatus = 'pending_upload' | 'ready' | 'processing' | 'completed' | 'error';
export type ProcessingStage = 'analysing' | 'compiling';
export type ChatRole = 'user' | 'assistant';
export type ChatQueryType = 'contract' | 'history' | 'both';
export type ConfidenceBand = 'high' | 'medium' | 'low'; // ≥80 | 50–79 | <50

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_HIGH) return 'high';
  if (score >= CONFIDENCE_LOW) return 'medium';
  return 'low';
}

export type KeyTerm = {
  id: string;
  term_key: string;
  term_name: string;
  is_custom: boolean;
  value: string | null;
  page_number: number | null;
  confidence_score: number;
  source_sentence: string | null;
  source_verified: boolean;
  is_edited: boolean;
  original_value: string | null;
  original_page_number: number | null;
  edited_at: string | null;
  display_order: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  cited_pages: number[];
  is_not_found: boolean;
  citation_missing: boolean;
  status: 'complete' | 'error';
  created_at: string;
};
