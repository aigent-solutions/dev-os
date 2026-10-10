import { describe, expect, it } from 'vitest';
import { buildChatMessages, trimHistoryToBudget, type HistoryMessage } from '@/lib/ai/chat';
import { countTokens } from '@/lib/ai/token-count';

// 09-contract-chat.md §12.
const msg = (role: 'user' | 'assistant', n: number): HistoryMessage => ({ role, content: `${role} message number ${n} `.repeat(20) });
const history: HistoryMessage[] = [msg('user', 1), msg('assistant', 1), msg('user', 2), msg('assistant', 2), msg('user', 3), msg('assistant', 3)];
const cost = (m: HistoryMessage) => countTokens(m.content) + 4;

describe('trimHistoryToBudget', () => {
  it('keeps everything when it fits', () => {
    expect(trimHistoryToBudget(history, 0, 1_000_000)).toEqual(history);
  });

  it('drops the oldest user+assistant pair first', () => {
    const all = history.reduce((n, m) => n + cost(m), 0);
    const out = trimHistoryToBudget(history, 0, all - 1); // one token too many
    expect(out).toEqual(history.slice(2));
  });

  it('drops pairs until it fits, possibly to nothing', () => {
    expect(trimHistoryToBudget(history, 10_000, 10_000)).toEqual([]);
  });

  it('a leading assistant message (no user before it) is dropped alone', () => {
    const h = [msg('assistant', 0), ...history];
    const all = h.reduce((n, m) => n + cost(m), 0);
    expect(trimHistoryToBudget(h, 0, all - 1)).toEqual(history);
  });
});

describe('buildChatMessages', () => {
  it('layout is system → history (ascending) → question', () => {
    const msgs = buildChatMessages({ version: 'chat-v1.0', contractType: 'nda', contractText: '[PAGE 1]\nx', queryType: 'both', history: history.slice(0, 2), question: 'Q?', maxInputTokens: 100_000 });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1]!.content).toBe(history[0]!.content);
    expect(msgs.at(-1)!.content).toBe('Q?');
  });

  it('trims history to the input budget, never the question or system prompt', () => {
    const base = { version: 'chat-v1.0', contractType: 'nda' as const, contractText: '[PAGE 1]\nx', queryType: 'contract' as const, question: 'Q?' };
    const full = buildChatMessages({ ...base, history, maxInputTokens: 1_000_000 });
    const fullTokens = full.reduce((n, m) => n + countTokens(String(m.content)) + 4, 0);
    const msgs = buildChatMessages({ ...base, history, maxInputTokens: fullTokens - 1 }); // forces exactly one pair out
    expect(msgs[0]).toEqual(full[0]);
    expect(msgs.at(-1)!.content).toBe('Q?');
    expect(msgs.slice(1, -1)).toEqual(history.slice(2));
  });
});
