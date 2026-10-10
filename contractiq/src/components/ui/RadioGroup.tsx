import { cn } from '@/lib/utils';

export type RadioOption<V extends string> = { value: V; label: string };

export type RadioGroupProps<V extends string> = {
  name: string;
  value: V | null;
  onValueChange: (value: V) => void;
  options: RadioOption<V>[];
  disabled?: boolean;
  className?: string;
};

/**
 * Native radio buttons (keyboard: Tab into the group, arrows move and select). Wrap in a
 * <fieldset> + <legend> for the group's name. 16 px circles, brand fill when checked, 2 px focus ring.
 */
export function RadioGroup<V extends string>({ name, value, onValueChange, options, disabled, className }: RadioGroupProps<V>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      {options.map((o) => (
        <label key={o.value} className="inline-flex cursor-pointer items-center gap-2 text-body-lg text-fg-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:text-fg-disabled">
          <span className="relative inline-flex h-4 w-4 shrink-0">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onValueChange(o.value)}
              className={cn(
                'peer h-4 w-4 cursor-pointer appearance-none rounded-full border border-border-control bg-surface',
                'transition-colors duration-100 ease-out checked:border-brand checked:bg-brand',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-page',
              )}
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 m-auto hidden h-2 w-2 rounded-full bg-surface peer-checked:block" />
          </span>
          {o.label}
        </label>
      ))}
    </div>
  );
}
