import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const controlClasses = (invalid?: boolean) =>
  cn(
    'w-full rounded-md border bg-surface px-3 text-body-lg text-fg-primary placeholder:text-fg-placeholder',
    'transition-colors duration-100 ease-out focus:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus',
    'disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-fg-disabled',
    invalid ? 'border-danger-border bg-danger-bg' : 'border-border-control',
  );

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses(invalid), 'h-10', className)}
      {...props}
    />
  );
});
