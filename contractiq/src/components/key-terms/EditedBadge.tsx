'use client';

import { formatDistanceToNow } from 'date-fns';
import { PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUpdateKeyTerm } from '@/hooks/useUpdateKeyTerm';
import type { KeyTerm } from '@/types/domain';
import { GlossaryInfo } from './TermInfo';

/** "Edited" badge: the original AI value, page and edit time, with "Restore AI value" (08 §8.2). */
export function EditedBadge({ term, contractId }: { term: KeyTerm; contractId: string }) {
  const mutation = useUpdateKeyTerm(contractId);
  const [open, setOpen] = useState(false);
  if (!term.is_edited) return null;

  const original = term.original_value ?? 'Not found in document';
  const summary = `Original AI value: ${original}`;
  const editedAt = term.edited_at ? new Date(term.edited_at) : null;

  return (
    <span className="inline-flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip content={summary}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-no-row-select
              aria-haspopup="dialog"
              aria-label={`Edited. ${summary}`}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Badge tone="brand" icon={PencilLine}>
                Edited
              </Badge>
            </button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent data-no-row-select className="max-w-80 p-3">
          <p className="text-body-sm text-fg-secondary">Original AI value:</p>
          <p className="whitespace-pre-wrap text-body-sm text-fg-primary [overflow-wrap:anywhere]">{original}</p>
          <p className="text-body-sm text-fg-secondary">Original page: {term.original_page_number ?? 'None'}</p>
          {editedAt && (
            <p className="text-body-sm text-fg-secondary" title={editedAt.toLocaleString()}>
              Edited {formatDistanceToNow(editedAt, { addSuffix: true })}
            </p>
          )}
          {term.original_value !== null && (
            <Button
              size="sm"
              variant="secondary"
              className="w-fit"
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate(
                  { termId: term.id, value: term.original_value!, page_number: term.original_page_number },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Restore AI value
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <GlossaryInfo term="edited" label="an edited value" />
    </span>
  );
}
