import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '@/hooks/useChat';
import { apiFetch } from '@/lib/api-client';
import { postChatStream, type ChatStreamHandlers } from '@/lib/chat/sse-client';

// 09-contract-chat.md §12 — the stream is driven by hand through the mocked SSE client.
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn() }));
vi.mock('@/lib/chat/sse-client', () => ({ postChatStream: vi.fn() }));

let handlers!: ChatStreamHandlers;
let signal!: AbortSignal;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({ messages: [] });
  vi.mocked(postChatStream).mockImplementation(async (_id, _m, h, s) => {
    handlers = h;
    signal = s;
  });
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useChat('c-1', { enabled: true }), { wrapper });
}
const frame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));

describe('useChat', () => {
  it('adds the user and assistant bubbles immediately', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('  What is the term?  '));
    expect(result.current.messages.map((m) => [m.role, m.content, !!m.pending, !!m.streaming])).toEqual([
      ['user', 'What is the term?', true, false],
      ['assistant', '', false, true],
    ]);
    expect(result.current.isStreaming).toBe(true);
    expect(postChatStream).toHaveBeenCalledWith('c-1', 'What is the term?', expect.anything(), expect.anything());
  });

  it('accumulates tokens per frame; done replaces the content with the server copy', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('q'));
    act(() => handlers.onMeta({ session_id: 's', user_message_id: 'u-1', query_type: 'contract' }));
    act(() => {
      handlers.onToken({ delta: 'Based on ' });
      handlers.onToken({ delta: 'the document' });
    });
    await frame();
    expect(result.current.messages[1]!.content).toBe('Based on the document');
    expect(result.current.messages[0]).toMatchObject({ id: 'u-1', pending: false });
    act(() => handlers.onDone({ message_id: 'a-1', cited_pages: [2], is_not_found: false, citation_missing: false, content: 'Based on the document, two years [Page 2].' }));
    expect(result.current.messages[1]).toMatchObject({ id: 'a-1', content: 'Based on the document, two years [Page 2].', cited_pages: [2], streaming: false, status: 'complete' });
    expect(result.current.isStreaming).toBe(false);
  });

  it('stop aborts the request and keeps the partial answer (including unflushed tokens)', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('q'));
    act(() => handlers.onToken({ delta: 'Partial ' }));
    await frame();
    act(() => handlers.onToken({ delta: 'answer' })); // not yet flushed
    act(() => result.current.stop());
    expect(signal.aborted).toBe(true);
    expect(result.current.messages[1]).toMatchObject({ content: 'Partial answer', streaming: false, status: 'error', errorMessage: 'Response interrupted.', retryable: true });
    expect(result.current.isStreaming).toBe(false);
  });

  it('an error before meta marks the user message failed too', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('q'));
    act(() => handlers.onError({ code: 'RATE_LIMITED', message: 'Slow down', retryable: true, message_id: null, partial: false }));
    expect(result.current.messages[0]).toMatchObject({ status: 'error', errorMessage: 'Slow down' });
    expect(result.current.messages[1]).toMatchObject({ status: 'error', content: '' });
  });

  it('ignores a send while streaming, and blank messages', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('   '));
    expect(postChatStream).not.toHaveBeenCalled();
    act(() => result.current.send('first'));
    act(() => result.current.send('second'));
    expect(postChatStream).toHaveBeenCalledTimes(1);
  });
});
