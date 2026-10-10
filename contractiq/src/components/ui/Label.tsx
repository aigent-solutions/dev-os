'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export type LabelProps = ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean };

export const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, LabelProps>(function Label(
  { required, className, children, ...props },
  ref,
) {
  return (
    <LabelPrimitive.Root ref={ref} className={cn('text-body-sm font-medium text-fg-primary', className)} {...props}>
      {children}
      {required && (
        <>
          <span aria-hidden> *</span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </LabelPrimitive.Root>
  );
});
