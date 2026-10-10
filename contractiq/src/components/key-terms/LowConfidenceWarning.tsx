'use client';

import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { LOW_CONFIDENCE_TOOLTIP } from '@/lib/constants';

/**
 * Always-visible ⚠️ for scores under 50 (FR-11, 06 §8.12). No dismiss control and no prop to hide it.
 * The full tooltip text is always in the DOM for screen readers via aria-describedby.
 */
export function LowConfidenceWarning({ termName }: { termName: string }) {
  const id = useId();
  return (
    <span className="inline-flex items-center">
      <Tooltip content={LOW_CONFIDENCE_TOOLTIP}>
        <button
          type="button"
          data-no-row-select
          aria-describedby={id}
          className="inline-flex items-center gap-1 rounded-sm text-body-sm font-medium text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
          Low confidence
          <span className="sr-only"> for {termName}</span>
        </button>
      </Tooltip>
      <span id={id} className="sr-only">
        {LOW_CONFIDENCE_TOOLTIP}
      </span>
    </span>
  );
}
