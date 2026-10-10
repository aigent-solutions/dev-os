'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export type ProgressProps = { value: number; label: string; className?: string };

export function Progress({ value, label, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-subtle', className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-brand transition-transform duration-250 ease-in-out"
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
