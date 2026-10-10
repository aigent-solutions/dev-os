import * as chatV1 from './chat.v1';
import * as extractionV1 from './extraction.v1';
import type { ExtractionPromptModule } from './types';
import {
  CHAT_PROMPT_VERSIONS,
  EXTRACTION_PROMPT_VERSIONS,
  type ChatPromptVersion,
  type ExtractionPromptVersion,
} from './versions';

// Prompt registry. The active version comes from EXTRACTION_PROMPT_VERSION (validated at boot by env.ts).
const EXTRACTION_PROMPTS: Record<ExtractionPromptVersion, ExtractionPromptModule> = {
  'extraction-v1.0': extractionV1,
};

export function getExtractionPrompt(version: string): ExtractionPromptModule {
  if (!(EXTRACTION_PROMPT_VERSIONS as readonly string[]).includes(version)) {
    throw new Error(`Unknown extraction prompt version: ${version}`);
  }
  return EXTRACTION_PROMPTS[version as ExtractionPromptVersion];
}

export type ChatPromptModule = { PROMPT_VERSION: string; buildChatSystemPrompt: typeof chatV1.buildChatSystemPrompt };
const CHAT_PROMPTS: Record<ChatPromptVersion, ChatPromptModule> = { 'chat-v1.0': chatV1 };

export function getChatPrompt(version: string): ChatPromptModule {
  if (!(CHAT_PROMPT_VERSIONS as readonly string[]).includes(version)) throw new Error(`Unknown chat prompt version: ${version}`);
  return CHAT_PROMPTS[version as ChatPromptVersion];
}
