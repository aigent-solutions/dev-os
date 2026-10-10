'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = {
  content: ReactNode;
  /** The trigger. Must be focusable (button, link) so the tooltip also opens on keyboard focus. */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  open?: boolean;
  /**
   * false (low-confidence warning): the content is also rendered as visually hidden text next to
   * the trigger, so it is always available to screen readers.
   */
  dismissible?: boolean;
  className?: string;
};

/** Opens on hover and keyboard focus; 150 ms ease-out. */
export function Tooltip({ content, children, side = 'top', open, dismissible = true, className }: TooltipProps) {
  return (
    <>
      <TooltipPrimitive.Root open={open}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className={cn(
              'z-50 max-w-xs rounded-md bg-fg-primary px-2 py-1 text-body-sm text-fg-inverse',
              'data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
      {!dismissible && <span className="sr-only">{content}</span>}
    </>
  );
}
