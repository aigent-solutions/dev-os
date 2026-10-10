'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FieldError } from './FieldError';
import { Label } from './Label';

export type FieldProps = {
  id: string;
  name: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  invalid?: boolean;
};

export type FormFieldProps = {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: FieldProps) => ReactNode;
};

/** Wires label, hint and error to the control via id / aria-describedby / aria-invalid. */
export function FormField({ label, name, error, hint, required, className, children }: FormFieldProps) {
  const id = `${name}-${useId()}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        name,
        'aria-describedby': describedBy,
        ...(error ? { 'aria-invalid': true as const, invalid: true } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-body-sm text-fg-secondary">
          {hint}
        </p>
      )}
      {errorId && <FieldError id={errorId} message={error} />}
    </div>
  );
}
