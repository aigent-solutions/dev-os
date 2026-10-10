'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { controlClasses } from './Input';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/** Radix Select styled like Input. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, onValueChange, options, placeholder, invalid, id, name, disabled, className, ...aria },
  ref,
) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} name={name} disabled={disabled}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(controlClasses(invalid), 'flex h-10 items-center justify-between gap-2 text-left', className)}
        {...aria}
      >
        <SelectPrimitive.Value placeholder={<span className="text-fg-placeholder">{placeholder}</span>} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="h-4 w-4 text-fg-secondary" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface p-1"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-sm pl-8 pr-2 text-body-lg text-fg-primary outline-none data-[highlighted]:bg-surface-subtle data-[disabled]:text-fg-disabled"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check aria-hidden className="h-4 w-4 text-brand" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});
