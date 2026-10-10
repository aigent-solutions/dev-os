import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ContractType } from '@/types/domain';
import type { ExtractionResult } from '../extraction-schema';
import type { RequestedTerm } from '../term-library';

export type FewShotExample = { id: string; contractType: ContractType; excerpt: string; expected: ExtractionResult };

export type ExtractionPromptModule = {
  PROMPT_VERSION: string;
  buildMessages(p: { contractType: ContractType; terms: RequestedTerm[]; contractText: string }): ChatCompletionMessageParam[];
};
