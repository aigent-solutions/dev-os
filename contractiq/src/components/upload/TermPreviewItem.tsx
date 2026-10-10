'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { GlossaryInfo, TermInfo } from '@/components/key-terms/TermInfo';

export type TermPreviewItemProps = {
  name: string;
  description: string | null;
  isCustom: boolean;
  onRemove?: () => void;
  disabled: boolean;
};

const iconButton =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-secondary transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:text-fg-disabled';

export function TermPreviewItem({ name, description, isCustom, onRemove, disabled }: TermPreviewItemProps) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className="flex items-center gap-2 text-body-lg text-fg-primary">
        {name}
        {isCustom && (
          <>
            <Badge tone="accent">Custom</Badge>
            <GlossaryInfo term="custom_term" label="a custom term" />
          </>
        )}
        {!isCustom && description && <TermInfo label={name} description={description} />}
      </span>
      {isCustom && onRemove && (
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove custom term ${name}`} className={iconButton}>
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
