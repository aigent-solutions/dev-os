'use client';

import { Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/Input';
import { CUSTOM_TERM_MAX, MAX_CUSTOM_TERMS } from '@/lib/constants';

export type AddCustomTermInputProps = {
  count: number;
  onAdd: (name: string) => { ok: boolean; message?: string };
  disabled: boolean;
};

/** "+ Add Key Term": inline input, Enter adds, Escape cancels, stays open for quick entry (04 §8.3). */
export function AddCustomTermInput({ count, onAdd, disabled }: AddCustomTermInputProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const counterId = `${id}-count`;
  const errorId = `${id}-error`;
  const full = count >= MAX_CUSTOM_TERMS;

  const close = () => {
    setOpen(false);
    setValue('');
    setError(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const submit = () => {
    const r = onAdd(value);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setValue('');
    setError(undefined);
    if (count + 1 >= MAX_CUSTOM_TERMS) close();
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          className="w-fit text-fg-link"
          onClick={() => setOpen(true)}
          disabled={disabled || full}
        >
          <Plus aria-hidden className="h-4 w-4" />
          Add Key Term
        </Button>
        {full && <p className="text-body-sm text-fg-secondary">Maximum 5 custom terms</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        Custom key term
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          autoFocus
          value={value}
          maxLength={CUSTOM_TERM_MAX}
          placeholder="e.g. Non-compete radius"
          invalid={!!error}
          aria-describedby={[counterId, error ? errorId : null].filter(Boolean).join(' ')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
          className="min-w-0 flex-1"
          disabled={disabled}
        />
        <Button size="sm" onClick={submit} disabled={disabled}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
      <p id={counterId} className="text-body-sm text-fg-secondary">
        {count}/{MAX_CUSTOM_TERMS}
      </p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
