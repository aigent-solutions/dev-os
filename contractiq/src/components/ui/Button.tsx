import { Slot, Slottable } from '@radix-ui/react-slot';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md text-body-lg font-medium transition-colors duration-100 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:pointer-events-none disabled:border disabled:border-border disabled:bg-surface-page disabled:text-fg-disabled';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-fg-inverse hover:bg-brand-hover active:bg-brand-pressed',
  secondary: 'border border-border-control bg-surface text-fg-primary hover:bg-surface-subtle active:bg-surface-pressed',
  ghost: 'bg-transparent text-fg-primary hover:bg-surface-subtle active:bg-surface-pressed',
  destructive: 'bg-danger-solid text-fg-inverse hover:bg-danger-fg',
};

const sizes: Record<ButtonSize, string> = { md: 'h-10 px-4', sm: 'h-8 px-3' };

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, asChild = false, className, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={buttonClasses(variant, size, className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...(!asChild && { type: props.type ?? 'button' })}
      {...props}
    >
      {loading && <Spinner size="sm" label="" className="-ml-1" />}
      <Slottable>{children}</Slottable>
    </Comp>
  );
});
