'use client';

import { forwardRef, useCallback, useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { controlClasses } from './Input';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  autoResize?: boolean;
  /** With autoResize: stop growing after this many rows, then scroll. */
  maxRows?: number;
};

const LINE_HEIGHT_PX = 24; // text-body-lg line height

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoResize = false, maxRows = 6, className, onChange, ...props },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = inner.current;
    if (!el || !autoResize) return;
    el.style.height = 'auto';
    const max = maxRows * LINE_HEIGHT_PX + 16; // + vertical padding
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [autoResize, maxRows]);

  useEffect(resize, [resize, props.value]);

  return (
    <textarea
      ref={(node) => {
        inner.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      aria-invalid={invalid || undefined}
      rows={props.rows ?? (autoResize ? 1 : 3)}
      className={cn(controlClasses(invalid), 'py-2', autoResize && 'resize-none', className)}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      {...props}
    />
  );
});
