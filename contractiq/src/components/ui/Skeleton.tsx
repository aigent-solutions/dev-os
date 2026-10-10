import { cn } from '@/lib/utils';

/** Loading placeholder. Decorative: the parent sets aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-subtle', className)} />;
}
