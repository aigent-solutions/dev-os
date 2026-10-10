'use client';

import { Send, Square } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { MAX_CHAT_MESSAGE_CHARS } from '@/lib/constants';

/** Enter sends, Shift+Enter newline, IME-safe; Send ↔ Stop; focus returns after a reply (09 §8). */
export function ChatInput({ disabled, isStreaming, onSend, onStop }: {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const wasStreaming = useRef(isStreaming);

  useEffect(() => {
    if (wasStreaming.current && !isStreaming) ref.current?.focus();
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (isStreaming || disabled || !text.trim()) return;
    onSend(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          autoResize
          rows={1}
          maxRows={6}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          value={text}
          disabled={disabled || isStreaming}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Ask a question about this contract"
          placeholder="Ask a question, e.g. Is there an auto-renewal clause?"
          className="min-w-0 flex-1"
        />
        {isStreaming ? (
          <Button type="button" variant="secondary" onClick={onStop} aria-label="Stop">
            <Square aria-hidden className="h-4 w-4" />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={disabled || !text.trim()} aria-label="Send">
            <Send aria-hidden className="h-4 w-4" />
            Send
          </Button>
        )}
      </div>
      {text.length >= 1800 && (
        <p className="text-body-sm text-fg-secondary">
          {text.length} / {MAX_CHAT_MESSAGE_CHARS}
        </p>
      )}
    </form>
  );
}
