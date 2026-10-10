import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FieldErrorProps = { id: string; message?: string; className?: string };

/** Inline field error. The input points at it with aria-describedby. */
export function FieldError({ id, message, className }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn('flex items-center gap-1 text-body-sm text-danger-fg', className)}>
      <AlertCircle aria-hidden className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}
