import { describe, expect, it } from 'vitest';
import { classifyQuery } from '@/lib/ai/classify-query';

// 09-contract-chat.md §12 — ≥ 30 table-driven phrases.
const CASES: [string, 'contract' | 'history' | 'both'][] = [
  // history
  ['What did you say earlier?', 'history'],
  ['Summarise our conversation', 'history'],
  ['Summarize this chat please', 'history'],
  ['Can you recap?', 'history'],
  ['What did I ask before?', 'history'],
  ['Repeat your last answer', 'history'],
  ['You said something before, what was it?', 'history'],
  ['What did you tell me previously?', 'history'],
  ['Go back to what you mentioned above', 'history'],
  ['Summarise the discussion so far', 'history'],
  // both
  ['Earlier you mentioned the liability cap — which page?', 'both'],
  ['You said the notice period was 30 days, is that the termination notice?', 'both'],
  ['Recap the payment terms we discussed', 'both'],
  ['What did you say before about the governing law?', 'both'],
  ['Previously you mentioned indemnification; where is that clause?', 'both'],
  ['Summarise our conversation about confidentiality', 'both'],
  ['In your last answer, which party pays the fees?', 'both'],
  // contract
  ['Is there an auto-renewal clause?', 'contract'],
  ['What is the governing law?', 'contract'],
  ['How long does the confidentiality obligation last?', 'contract'],
  ['Who are the parties?', 'contract'],
  ['What is the liability cap?', 'contract'],
  ['Can either side terminate for convenience?', 'contract'],
  ['When are invoices due?', 'contract'],
  ['Is there a non-compete?', 'contract'],
  ['What happens on breach?', 'contract'],
  ['Who owns the intellectual property?', 'contract'],
  ['Where do disputes get resolved?', 'contract'],
  ['Does this contract mention GDPR?', 'contract'],
  ['Hello', 'contract'],
  ['What does "mutatis mutandis" mean?', 'contract'],
  ['Is this agreement exclusive?', 'contract'],
];

describe('classifyQuery', () => {
  it('has at least 30 cases', () => expect(CASES.length).toBeGreaterThanOrEqual(30));
  it.each(CASES)('%s → %s', (q, expected) => expect(classifyQuery(q)).toBe(expected));
});
