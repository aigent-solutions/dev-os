'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Modal dialog: focus trapped, Esc closes, focus returns to the trigger (Radix). */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay p-4 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in">
          <DialogPrimitive.Content
            className={cn(
              'relative flex w-full max-w-md flex-col gap-6 rounded-xl bg-surface p-6 focus:outline-none',
              'data-[state=closed]:animate-modal-out data-[state=open]:animate-modal-in',
              className,
            )}
            {...(description ? {} : { 'aria-describedby': undefined })}
          >
            <div className="flex flex-col gap-2 pr-8">
              <DialogPrimitive.Title className="text-h5 text-fg-primary">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-body-lg font-normal text-fg-secondary">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {children}
            {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden className="h-4 w-4" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
