import type { ListContractsQuery } from '@/lib/validation/contract';
import type { Database } from './database.types';
import type { ChatMessage, ContractStatus, ContractType, DetectedContractType, KeyTerm, ProcessingStage } from './domain';

// API DTOs. Feature specs add their own request/response types here.

/** Error envelope returned by every API route (engineering-doc §9, README §3.3). */
export type ApiErrorBody = {
  error: { code: string; message: string; retryable: boolean; details: Record<string, unknown> };
  request_id: string;
};

/** GET /api/health (00-foundation.md §5). */
export type HealthResponse = { status: 'ok' | 'degraded'; db: 'ok' | 'error'; version: string };

/** Query for GET /api/contracts (10-dashboard.md §5.2), inferred from ListContractsQuerySchema. */
export type { ListContractsQuery };

/** One of the 5 most recent contracts (10 §5.1). review_completed_at drives the "Reviewed" pill. */
export type RecentContract = {
  id: string;
  file_name: string;
  contract_type: ContractType;
  status: ContractStatus;
  review_completed_at: string | null;
  created_at: string;
};

/** GET /api/dashboard/summary (10 §5.1). */
export type DashboardSummary = {
  total: number;
  by_type: { nda: number; msa: number };
  reviewed: number;
  recent: RecentContract[];
};

/** A row of GET /api/contracts (10 §5.2). Never contains contract_text. */
export type ContractListItem = {
  id: string;
  file_name: string;
  contract_type: ContractType;
  status: ContractStatus;
  page_count: number | null;
  created_at: string;
  review_completed_at: string | null;
  low_confidence_count: number;
};

/** GET /api/contracts (10 §5.2). A page past the end returns items: [] with the real total. */
export type ListContractsResponse = { items: ContractListItem[]; page: number; page_size: number; total: number };

/** GET /api/contracts/{id} (06 §5.1). Never contains file_path or user_id. */
export type ContractDetail = {
  contract: {
    id: string;
    file_name: string;
    contract_type: ContractType;
    detected_contract_type: DetectedContractType | null;
    type_mismatch: boolean;
    status: ContractStatus;
    processing_stage: ProcessingStage | null;
    page_count: number | null;
    created_at: string;
    review_completed_at: string | null;
    prompt_version: string | null;
    processing_attempts: number; // RetryButton hides itself at MAX_PROCESSING_ATTEMPTS (05 §8)
    contract_text: string | null;
    error: { code: string; message: string } | null;
  };
  pdf_url: string | null;
  pdf_url_expires_at: string | null;
  key_terms: KeyTerm[];
  custom_terms: { id: string; term_name: string }[];
  feedback: { rating: 'up' | 'down'; comment: string | null; accuracy_rating: 'yes' | 'partially' | 'no' | null } | null;
};

/** PATCH /api/contracts/{id} (06 §5.2). */
export type ContractUpdateResponse = { id: string; file_name: string; review_completed_at: string | null };

/** PATCH /api/key-terms/{id} (08 §5). */
export type KeyTermUpdateResult = Pick<
  KeyTerm,
  'id' | 'value' | 'page_number' | 'is_edited' | 'original_value' | 'original_page_number' | 'edited_at'
>;

/** GET /api/contracts/{id}/chat (09 §5.1): ascending, ≤ 200, includes failed assistant rows. */
export type ChatHistoryResponse = { session_id: string | null; messages: ChatMessage[] };

/** PUT /api/contracts/{id}/feedback response (11 §5). */
export type FeedbackResult = {
  id: string;
  rating: 'up' | 'down';
  comment: string | null;
  accuracy_rating: 'yes' | 'partially' | 'no' | null;
  updated_at: string;
};

/** PATCH /api/account response and the settings page profile (13 §5.2). */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  plan: Database['public']['Enums']['plan_tier'];
  trial_ends_at: string | null;
  feedback_opt_in: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};
