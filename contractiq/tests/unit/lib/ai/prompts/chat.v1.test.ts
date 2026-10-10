import { describe, expect, it } from 'vitest';
import { buildChatMessages } from '@/lib/ai/chat';
import { buildChatSystemPrompt, PROMPT_VERSION } from '@/lib/ai/prompts/chat.v1';

// 09-contract-chat.md §12.
const TEXT = '[PAGE 1]\nThe term is two years.';

describe(`chat prompt ${PROMPT_VERSION}`, () => {
  it.each(['contract', 'history', 'both'] as const)('%s variant matches the snapshot', (queryType) => {
    expect(buildChatSystemPrompt({ contractType: 'nda', queryType, contractText: TEXT })).toMatchSnapshot();
  });

  it('wraps the contract in <contract> for every variant', () => {
    for (const queryType of ['contract', 'history', 'both'] as const) {
      expect(buildChatSystemPrompt({ contractType: 'msa', queryType, contractText: TEXT })).toContain(`<contract>\n${TEXT}\n</contract>`);
    }
  });

  it('the question is never in the system prompt; it is always the last user message', () => {
    const question = 'UNIQUE QUESTION 4242: what is the term?';
    const msgs = buildChatMessages({ version: PROMPT_VERSION, contractType: 'nda', contractText: TEXT, queryType: 'contract', history: [], question, maxInputTokens: 100_000 });
    expect(String(msgs[0]!.content)).not.toContain('UNIQUE QUESTION 4242');
    expect(msgs.at(-1)).toEqual({ role: 'user', content: question });
  });
});
