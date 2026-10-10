'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/Button';
import type { UiMessage } from '@/hooks/useChat';
import { cn } from '@/lib/utils';
import { CitationLink } from './CitationLink';

/** Plain text only (no HTML/markdown); valid [Page N] tokens become chips, invalid ones stay text (09 §8). */
function renderContent(content: string, pageCount: number) {
  return content.split(/(\[Page \d+\])/gi).map((part, i) => {
    const m = /^\[Page (\d+)\]$/i.exec(part);
    const n = m ? Number(m[1]) : NaN;
    if (m && n >= 1 && n <= pageCount) return <CitationLink key={i} page={n} />;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function ChatMessage({ message, pageCount, onRetry }: { message: UiMessage; pageCount: number; onRetry?: () => void }) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const sources = [...new Set(message.cited_pages)].sort((a, b) => a - b);

  if (isUser) {
    return (
      <li className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-md bg-brand-subtle px-4 py-3 text-body-lg font-normal text-fg-primary [overflow-wrap:anywhere]">
          {message.content}
        </div>
        {isError && message.errorMessage && (
          <p className="flex items-center gap-1 text-body-sm text-danger-fg">
            <AlertCircle aria-hidden className="h-3 w-3" />
            {message.errorMessage}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-col items-start gap-1" aria-busy={message.streaming || undefined}>
      <span className="text-body-sm text-fg-secondary">ContractIQ</span>
      <div className="flex max-w-[85%] flex-col gap-2 rounded-md border border-border bg-surface-subtle px-4 py-3">
        {(message.content || message.streaming) && (
          <p className="whitespace-pre-wrap text-body-lg font-normal text-fg-primary [overflow-wrap:anywhere]">
            {renderContent(message.content, pageCount)}
            {message.streaming && (
              <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-fg-primary motion-reduce:animate-none" />
            )}
          </p>
        )}
        {!message.streaming && !isError && sources.length > 0 && (
          <p className="flex flex-wrap items-center gap-1 text-body-sm text-fg-secondary">
            Source:
            {sources.map((p) => (p <= pageCount ? <CitationLink key={p} page={p} /> : null))}
          </p>
        )}
        {!message.streaming && !isError && message.citation_missing && (
          <p className="flex items-center gap-1 text-body-sm text-warning-fg">
            <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />
            No page citation — verify in the document
          </p>
        )}
        {isError && (
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('flex items-center gap-1 text-body-sm text-danger-fg')}>
              <AlertCircle aria-hidden className="h-3 w-3 shrink-0" />
              {message.errorMessage ?? (message.content ? 'Response interrupted.' : "Couldn't get an answer.")}
            </p>
            {onRetry && message.retryable !== false && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
