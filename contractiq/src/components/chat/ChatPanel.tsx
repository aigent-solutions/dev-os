'use client';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ChatState } from '@/hooks/useChat';
import type { ContractStatus, ContractType } from '@/types/domain';
import { ChatInput } from './ChatInput';
import { ChatMessageList } from './ChatMessageList';

export type ChatPanelProps = {
  chat: ChatState; // useChat lives at side-panel level (09 §7)
  contractType: ContractType;
  status: ContractStatus;
  pageCount: number;
};

/** Grounded Q&A over this contract (09 §8). Read-only unless the analysis is complete. */
export function ChatPanel({ chat, contractType, status, pageCount }: ChatPanelProps) {
  const canSend = status === 'completed';
  return (
    <section aria-label="Contract chat" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body-lg text-fg-primary">Ask about this contract</h2>
        <p className="text-body-sm text-fg-secondary">Answers come only from this document.</p>
      </div>
      {!canSend && <Banner tone="info">Chat is available once the analysis is complete.</Banner>}
      {chat.isLoading ? (
        <div aria-busy="true" aria-label="Loading conversation" className="flex flex-col gap-3">
          <Skeleton className="ml-auto h-12 w-3/5" />
          <Skeleton className="h-20 w-4/5" />
          <Skeleton className="ml-auto h-12 w-1/2" />
        </div>
      ) : chat.loadError ? (
        <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void chat.reload()}>Try again</Button>}>
          We couldn&apos;t load this conversation.
        </Banner>
      ) : (
        <ChatMessageList
          messages={chat.messages}
          pageCount={pageCount}
          contractType={contractType}
          onRetry={chat.retry}
          onSuggestion={chat.send}
          canSend={canSend && !chat.isStreaming}
        />
      )}
      <ChatInput disabled={!canSend || chat.isLoading} isStreaming={chat.isStreaming} onSend={chat.send} onStop={chat.stop} />
    </section>
  );
}
