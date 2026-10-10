'use client';

import { useQuery } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { postChatStream } from '@/lib/chat/sse-client';
import { qk } from '@/lib/query-keys';
import type { ChatHistoryResponse } from '@/types/api';
import type { ChatMessage } from '@/types/domain';

export type UiMessage = ChatMessage & { localId: string; pending?: boolean; streaming?: boolean; errorMessage?: string; retryable?: boolean };

const toUi = (m: ChatMessage): UiMessage => ({ ...m, localId: m.id, retryable: m.status === 'error' });

/**
 * Chat state for one contract (09 §7). Lives at side-panel level so it survives tab switches; history is
 * re-read from the server whenever the panel mounts.
 */
export function useChat(contractId: string, opts: { enabled: boolean }) {
  const history = useQuery({
    queryKey: qk.chat(contractId),
    queryFn: () => apiFetch<ChatHistoryResponse>(`/api/contracts/${contractId}/chat`),
    enabled: opts.enabled,
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const initialised = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const pendingDelta = useRef('');
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!initialised.current && history.data) {
      initialised.current = true;
      setMessages(history.data.messages.map(toUi));
    }
  }, [history.data]);

  useEffect(() => () => controller.current?.abort(), []); // unmount aborts any in-flight stream

  const patch = useCallback((localId: string, change: Partial<UiMessage>) => {
    setMessages((list) => list.map((m) => (m.localId === localId ? { ...m, ...change } : m)));
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || isStreaming) return;
      const userLocal = 'u-' + nanoid(8);
      const asstLocal = 'a-' + nanoid(8);
      const now = new Date().toISOString();
      const base = { cited_pages: [], is_not_found: false, citation_missing: false, status: 'complete' as const, created_at: now };
      setMessages((list) => [
        ...list,
        { ...base, id: userLocal, localId: userLocal, role: 'user', content: text, pending: true },
        { ...base, id: asstLocal, localId: asstLocal, role: 'assistant', content: '', streaming: true },
      ]);
      setStreaming(true);
      const ctl = new AbortController();
      controller.current = ctl;
      let gotMeta = false;

      // Tokens are batched per animation frame rather than re-rendering per token.
      const flush = () => {
        frame.current = null;
        const delta = pendingDelta.current;
        pendingDelta.current = '';
        if (delta) setMessages((list) => list.map((m) => (m.localId === asstLocal ? { ...m, content: m.content + delta } : m)));
      };

      void postChatStream(
        contractId,
        text,
        {
          onMeta: (d) => {
            gotMeta = true;
            patch(userLocal, { id: d.user_message_id, pending: false });
          },
          onToken: ({ delta }) => {
            pendingDelta.current += delta;
            frame.current ??= requestAnimationFrame(flush);
          },
          onDone: (d) => {
            if (frame.current) cancelAnimationFrame(frame.current);
            frame.current = null;
            pendingDelta.current = '';
            patch(asstLocal, {
              id: d.message_id,
              content: d.content,
              cited_pages: d.cited_pages,
              is_not_found: d.is_not_found,
              citation_missing: d.citation_missing,
              status: 'complete',
              streaming: false,
            });
            setStreaming(false);
          },
          onError: (e) => {
            if (frame.current) cancelAnimationFrame(frame.current);
            frame.current = null;
            const delta = pendingDelta.current;
            pendingDelta.current = '';
            setMessages((list) =>
              list.map((m) => {
                if (m.localId === asstLocal) {
                  return { ...m, content: e.partial ? m.content + delta : '', streaming: false, status: 'error', errorMessage: e.message, retryable: e.retryable };
                }
                if (m.localId === userLocal && !gotMeta) return { ...m, pending: false, status: 'error', errorMessage: e.message };
                return m;
              }),
            );
            setStreaming(false);
          },
        },
        ctl.signal,
      );
    },
    [contractId, isStreaming, patch],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    const delta = pendingDelta.current;
    pendingDelta.current = '';
    setMessages((list) =>
      list.map((m) =>
        m.streaming ? { ...m, content: m.content + delta, streaming: false, status: 'error', errorMessage: 'Response interrupted.', retryable: true } : m,
      ),
    );
    setStreaming(false);
  }, []);

  /** Re-sends the question before a failed answer as a new message (the failed pair stays, as in the DB). */
  const retry = useCallback(
    (localId: string) => {
      const i = messages.findIndex((m) => m.localId === localId);
      const question = [...messages.slice(0, i + 1)].reverse().find((m) => m.role === 'user');
      if (question) send(question.content);
    },
    [messages, send],
  );

  return {
    messages,
    isLoading: history.isLoading,
    isStreaming,
    loadError: history.error as Error | null,
    reload: history.refetch,
    send,
    stop,
    retry,
  };
}
export type ChatState = ReturnType<typeof useChat>;
