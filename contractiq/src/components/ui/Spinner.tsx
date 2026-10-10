import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SpinnerProps = { size?: 'sm' | 'md'; label?: string; className?: string };

/** Spinning loader with a visually hidden label for screen readers. */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <Loader2 aria-hidden className={cn('animate-spin', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
