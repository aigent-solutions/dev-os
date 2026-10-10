import { getEncoding, type Tiktoken } from 'js-tiktoken';

// o200k_base is the GPT-4o encoding. [PAGE N] markers are counted: they are sent to the model.
let enc: Tiktoken | null = null;

export function countTokens(text: string): number {
  enc ??= getEncoding('o200k_base');
  return enc.encode(text).length;
}
