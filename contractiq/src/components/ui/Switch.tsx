import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-describedby'?: string;
};

/**
 * Native switch: <button role="switch" aria-checked>, toggled by click, Space and Enter. Pair it with
 * <label htmlFor>. On: brand. Off: Grey 300 (control border token), not 13 §9's Grey 200, which is
 * under the 3:1 non-text contrast a control needs against white.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, id, disabled, className, ...aria },
  ref,
) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-border-control',
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          'ml-0.5 h-5 w-5 rounded-full bg-surface transition-transform duration-150 ease-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
});
