// Known prompt versions. Kept dependency-free so env.ts can validate EXTRACTION_PROMPT_VERSION at boot
// (05 §6.7) without importing the prompt modules.
export const EXTRACTION_PROMPT_VERSIONS = ['extraction-v1.0'] as const;
export type ExtractionPromptVersion = (typeof EXTRACTION_PROMPT_VERSIONS)[number];
export const CHAT_PROMPT_VERSIONS = ['chat-v1.0'] as const;
export type ChatPromptVersion = (typeof CHAT_PROMPT_VERSIONS)[number];
