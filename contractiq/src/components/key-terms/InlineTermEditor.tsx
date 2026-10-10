'use client';

import { Pencil } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { useUpdateKeyTerm } from '@/hooks/useUpdateKeyTerm';
import { ApiClientError, errorTone } from '@/lib/api-client';
import { MAX_TERM_VALUE_CHARS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { KeyTermUpdateSchema } from '@/lib/validation/key-term';
import type { KeyTerm } from '@/types/domain';
import { GlossaryInfo } from './TermInfo';

type Errors = { value?: string; page?: string };

export type InlineTermEditorProps = {
  term: KeyTerm;
  contractId: string;
  pageCount: number;
  disabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
};

/** Click-to-edit value and page (08 §8.1). Optimistic save; Retry from the error toast. */
export function InlineTermEditor({ term, contractId, pageCount, disabled = false, onSavingChange }: InlineTermEditorProps) {
  const mutation = useUpdateKeyTerm(contractId);
  const [mode, setMode] = useState<'display' | 'editing'>('display');
  const [draftValue, setDraftValue] = useState('');
  const [draftPage, setDraftPage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [announcement, setAnnouncement] = useState('');
  const displayRef = useRef<HTMLButtonElement>(null);
  const refocusDisplay = useRef(false);
  const id = useId();
  const valueErrId = `${id}-value-error`;
  const pageErrId = `${id}-page-error`;
  const saving = mutation.isPending;

  // Return focus to the value button in the same commit that closes the editor, so it never rests on <body>.
  useLayoutEffect(() => {
    if (mode === 'display' && refocusDisplay.current) {
      refocusDisplay.current = false;
      displayRef.current?.focus();
    }
  }, [mode]);

  const open = (value = term.value ?? '', page = term.page_number?.toString() ?? '', errs: Errors = {}) => {
    setDraftValue(value);
    setDraftPage(page);
    setErrors(errs);
    setMode('editing');
  };

  const close = (refocus: boolean) => {
    refocusDisplay.current = refocus;
    setMode('display');
    setErrors({});
  };

  const save = () => {
    const value = draftValue.trim();
    const pageText = draftPage.trim();
    const page = pageText === '' ? null : Number(pageText);
    const errs: Errors = {};
    const parsed = KeyTermUpdateSchema.safeParse({ value, page_number: page });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      if (fe.value?.[0]) errs.value = fe.value[0];
      if (fe.page_number?.[0]) errs.page = Number.isInteger(page) ? fe.page_number[0] : 'Page must be 1 or higher';
    }
    if (page !== null && Number.isInteger(page) && (page < 1 || page > pageCount)) errs.page = `Page must be between 1 and ${pageCount}`;
    if (errs.value || errs.page) {
      setErrors(errs);
      return false;
    }

    const pageChanged = page !== term.page_number;
    if (value === term.value && !pageChanged) {
      close(true); // unchanged → cancel, no request
      return true;
    }

    const vars = { termId: term.id, value, ...(pageChanged ? { page_number: page } : {}) };
    refocusDisplay.current = true;
    setMode('display');
    onSavingChange?.(true);
    mutation.mutate(vars, {
      onSuccess: () => {
        setAnnouncement('');
        requestAnimationFrame(() => setAnnouncement(`Saved ${term.term_name}`));
      },
      onError: (e) => {
        const details = e instanceof ApiClientError ? e.details : {};
        const serverErrs: Errors = {
          value: typeof details.value === 'string' ? details.value : undefined,
          page: typeof details.page_number === 'string' ? details.page_number : undefined,
        };
        toast({
          title: `Couldn't save ${term.term_name}`,
          description: e instanceof ApiClientError ? e.message : 'Something went wrong. Please try again.',
          tone: errorTone(e),
          action: { label: 'Retry', onClick: () => open(value, pageText, serverErrs) },
        });
      },
      onSettled: () => onSavingChange?.(false),
    });
    return true;
  };

  const onGroupBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; // moving within the editor
    const unchanged = draftValue.trim() === (term.value ?? '') && draftPage.trim() === (term.page_number?.toString() ?? '');
    if (unchanged) close(false);
    else save(); // invalid → stays open with errors
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  };

  if (mode === 'display') {
    return (
      <div className="flex items-start gap-2">
        <button
          ref={displayRef}
          type="button"
          data-no-row-select
          disabled={disabled}
          aria-disabled={saving || undefined}
          onClick={() => {
            if (!saving) open(); // stays focusable while saving, but can't be re-opened until the save settles
          }}
          aria-label={`Edit ${term.term_name} value`}
          className={cn(
            'group -mx-2 flex flex-1 items-start gap-2 rounded-md px-2 py-1 text-left transition-colors duration-100 ease-out',
            'hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default aria-disabled:cursor-progress',
          )}
        >
          <span
            className={cn(
              'flex-1 whitespace-pre-wrap text-body-lg [overflow-wrap:anywhere]',
              term.value === null ? 'font-normal text-fg-secondary' : 'text-fg-primary',
            )}
          >
            {term.value ?? 'Not found in document'}
          </span>
          <Pencil aria-hidden className="mt-1 h-4 w-4 shrink-0 text-fg-secondary opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
        {term.value === null && <GlossaryInfo term="not_found" label="Not found in document" />}
        {saving && <Spinner size="sm" label={`Saving ${term.term_name}`} className="mt-1" />}
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard handling lives on the fields; the group only catches blur
    <div role="group" aria-label={`Edit ${term.term_name}`} data-no-row-select onBlur={onGroupBlur} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Textarea
          autoFocus
          autoResize
          maxRows={8}
          rows={2}
          maxLength={MAX_TERM_VALUE_CHARS}
          aria-label={`${term.term_name} value`}
          value={draftValue}
          invalid={!!errors.value}
          aria-describedby={errors.value ? valueErrId : undefined}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {draftValue.length > 1800 && (
          <p className="text-body-sm text-fg-secondary">
            {draftValue.length}/{MAX_TERM_VALUE_CHARS}
          </p>
        )}
        <FieldError id={valueErrId} message={errors.value} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-page`} className="text-body-sm text-fg-primary">
            Page
          </label>
          <Input
            id={`${id}-page`}
            type="number"
            inputMode="numeric"
            min={1}
            max={pageCount}
            value={draftPage}
            invalid={!!errors.page}
            aria-describedby={errors.page ? pageErrId : undefined}
            onChange={(e) => setDraftPage(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-8 w-20"
          />
        </div>
        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => close(true)}>
          Cancel
        </Button>
      </div>
      <FieldError id={pageErrId} message={errors.page} />
    </div>
  );
}
