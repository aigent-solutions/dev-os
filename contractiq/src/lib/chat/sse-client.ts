'use client';

import type { ChatQueryType } from '@/types/domain';

// Browser parser for the POST SSE chat stream (09 §6.11). EventSource can't POST, so this reads fetch's body.
export type ChatStreamHandlers = {
  onMeta(d: { session_id: string; user_message_id: string; query_type: ChatQueryType }): void;
  onToken(d: { delta: string }): void;
  onDone(d: { message_id: string; cited_pages: number[]; is_not_found: boolean; citation_missing: boolean; content: string }): void;
  onError(d: { code: string; message: string; retryable: boolean; message_id: string | null; partial: boolean }): void;
};

const INTERRUPTED = { code: 'INTERNAL_ERROR', message: 'Response interrupted.', retryable: true, message_id: null, partial: true };

export async function postChatStream(contractId: string, message: string, h: ChatStreamHandlers, signal: AbortSignal): Promise<void> {
  let terminal = false;
  try {
    const res = await fetch(`/api/contracts/${contractId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; retryable?: boolean } } | null;
      h.onError({
        code: body?.error?.code ?? 'INTERNAL_ERROR',
        message: body?.error?.message ?? 'Something went wrong on our side. Please try again.',
        retryable: body?.error?.retryable ?? res.status >= 500,
        message_id: null,
        partial: false,
      });
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const dispatch = (block: string) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // keep-alive comment
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) return;
      const payload = JSON.parse(data.join('\n'));
      if (event === 'meta') h.onMeta(payload);
      else if (event === 'token') h.onToken(payload);
      else if (event === 'done') {
        terminal = true;
        h.onDone(payload);
      } else if (event === 'error') {
        terminal = true;
        h.onError(payload);
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        dispatch(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    }
    if (buffer.trim()) dispatch(buffer);
    if (!terminal && !signal.aborted) h.onError(INTERRUPTED); // stream ended with no terminal event
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' || signal.aborted) return; // Stop button
    if (!terminal) h.onError({ ...INTERRUPTED, partial: false, message: "Couldn't get an answer." });
  }
}
