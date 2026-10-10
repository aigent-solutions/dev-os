import { Info } from 'lucide-react';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

/** On every results view at every breakpoint. No close control (06 §8.5, HHH). */
export function LegalDisclaimer() {
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-border bg-surface-page p-3 text-body-sm text-fg-secondary">
      <Info aria-hidden className="mt-px h-4 w-4 shrink-0" />
      {LEGAL_DISCLAIMER}
    </p>
  );
}
