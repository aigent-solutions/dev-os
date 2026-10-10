'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { UiMessage } from '@/hooks/useChat';
import type { ContractType } from '@/types/domain';
import { ChatMessage } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';

const NEAR_BOTTOM_PX = 80;

/** role="log": keeps to the bottom while the user is near it; otherwise offers "Jump to latest" (09 §8). */
export function ChatMessageList({ messages, pageCount, contractType, onRetry, onSuggestion, canSend }: {
  messages: UiMessage[];
  pageCount: number;
  contractType: ContractType;
  onRetry: (localId: string) => void;
  onSuggestion: (q: string) => void;
  canSend: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);

  const scrollToBottom = (smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (nearBottom) scrollToBottom(false);
  }, [messages, nearBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX);
        }}
        className="h-full overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <SuggestedQuestions contractType={contractType} onSelect={onSuggestion} disabled={!canSend} />
        ) : (
          // The log role sits on a wrapper: on the <ol> itself it would replace the list role and orphan the <li>s.
          <div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
            <ol className="flex flex-col gap-3">
              {messages.map((m) => (
                <ChatMessage key={m.localId} message={m} pageCount={pageCount} onRetry={m.role === 'assistant' ? () => onRetry(m.localId) : undefined} />
              ))}
            </ol>
          </div>
        )}
      </div>
      {!nearBottom && messages.length > 0 && (
        <Button variant="secondary" size="sm" className="absolute bottom-2 left-1/2 -translate-x-1/2" onClick={() => scrollToBottom(true)}>
          <ArrowDown aria-hidden className="h-4 w-4" />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
