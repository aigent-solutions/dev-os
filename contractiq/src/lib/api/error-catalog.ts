// Error catalog — values exactly as docs/specs/README.md §4. User messages are shown verbatim.
export const ERROR_CATALOG = {
  VALIDATION_ERROR: { status: 400, retryable: false, message: 'Please check the highlighted fields.' },
  UNAUTHORIZED: { status: 401, retryable: false, message: 'Please sign in to continue.' },
  FORBIDDEN: { status: 403, retryable: false, message: "You don't have access to this." },
  NOT_FOUND: { status: 404, retryable: false, message: "We couldn't find that contract." },
  INVALID_STATUS: { status: 409, retryable: false, message: "This contract isn't ready for that action yet." },
  ALREADY_PROCESSING: { status: 409, retryable: false, message: 'This contract is already being analysed.' },
  MAX_ATTEMPTS: {
    status: 409,
    retryable: false,
    message: 'This contract has failed too many times. Please upload it again.',
  },
  CONTRACT_NOT_READY: { status: 409, retryable: false, message: 'Chat is available once the analysis is complete.' },
  FILE_TOO_LARGE: { status: 413, retryable: false, message: 'Please upload a PDF under 10 MB.' },
  NOT_A_PDF: { status: 422, retryable: false, message: 'Please upload a PDF under 10 MB.' },
  PDF_ENCRYPTED: {
    status: 422,
    retryable: false,
    message: "We couldn't read this PDF. It may be password-protected or corrupted.",
  },
  PDF_UNREADABLE: {
    status: 422,
    retryable: false,
    message: "We couldn't read this PDF. It may be password-protected or corrupted.",
  },
  TOO_MANY_PAGES: {
    status: 422,
    retryable: false,
    message: 'This contract has {page_count} pages. ContractIQ currently supports up to 20 pages.',
  },
  SCANNED_PDF: {
    status: 422,
    retryable: false,
    message: 'Scanned PDFs are not supported yet. Please upload a PDF with selectable text.',
  },
  CONTRACT_TOO_LONG: {
    status: 422,
    retryable: false,
    message:
      'This contract is too long for ContractIQ right now (max ~15,000 tokens). Longer contract support is coming.',
  },
  RATE_LIMITED: {
    status: 429,
    retryable: true,
    message: "You're doing that a lot — please wait {retry_after} seconds and try again.",
  },
  INTERNAL_ERROR: { status: 500, retryable: true, message: 'Something went wrong on our side. Please try again.' },
  STORAGE_UNAVAILABLE: {
    status: 502,
    retryable: true,
    message: "We couldn't reach file storage. Please try again in a few minutes.",
  },
  JOB_DISPATCH_FAILED: { status: 502, retryable: true, message: "We couldn't start the analysis. Please try again." },
  UPSTREAM_UNAVAILABLE: {
    status: 502,
    retryable: true,
    message: 'Our AI provider is unavailable. Try again in a few minutes.',
  },
  UPSTREAM_TIMEOUT: { status: 504, retryable: true, message: 'This is taking longer than expected. Please try again.' },
  // OpenAI refused the request itself (4xx, not 429): our configuration, not the user's input.
  UPSTREAM_REJECTED: {
    status: 502,
    retryable: false,
    message: "Something went wrong on our side, and trying again won't fix it. Please contact support.",
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

// Contract-level error codes stored in contracts.error_code (README §4, second table).
export const CONTRACT_ERROR_CODES = [
  'OPENAI_UNAVAILABLE',
  'OPENAI_REQUEST_REJECTED',
  'INVALID_AI_OUTPUT',
  'PROCESSING_TIMEOUT',
  'SYNC_BUDGET_EXCEEDED',
  'INTERNAL_ERROR',
] as const;
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];
export const CONTRACT_ERROR_MESSAGE = "We couldn't analyse your contract right now. Try again in a few minutes.";
export const CONTRACT_REJECTED_MESSAGE = "Something went wrong on our side, and trying again won't fix it. Please contact support.";

/** Contract errors a retry can't fix: the results page shows no "Try again" for these. */
export const NON_RETRYABLE_CONTRACT_ERROR_CODES: readonly string[] = ['OPENAI_REQUEST_REJECTED'] satisfies ContractErrorCode[];

export const contractErrorMessage = (code: ContractErrorCode) =>
  NON_RETRYABLE_CONTRACT_ERROR_CODES.includes(code) ? CONTRACT_REJECTED_MESSAGE : CONTRACT_ERROR_MESSAGE;
