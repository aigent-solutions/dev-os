'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { cn } from '@/lib/utils';

export type SourceSentenceDisclosureProps = {
  sourceSentence: string | null;
  sourceVerified: boolean;
  termName: string;
  'data-onboarding'?: string;
};

/** "Why?" — the verbatim source sentence the value came from (06 §8.13). Closed by default. */
export function SourceSentenceDisclosure({ sourceSentence, sourceVerified, termName, ...rest }: SourceSentenceDisclosureProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger
        data-no-row-select
        aria-label={`Why? Show the source sentence for ${termName}`}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-body-sm font-medium text-fg-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        {...rest}
      >
        Why?
        <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform duration-150 ease-out', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">
        {sourceSentence ? (
          <>
            {!sourceVerified && (
              <div className="flex flex-col gap-1">
                <Badge tone="warning">Source not verified</Badge>
                <p className="text-body-sm text-fg-secondary">
                  We couldn&apos;t find this exact sentence in the document, so treat this value with extra care.
                </p>
              </div>
            )}
            <blockquote className="select-text border-l-2 border-border-strong pl-3 text-body-sm text-fg-primary">
              &ldquo;{sourceSentence}&rdquo;
            </blockquote>
          </>
        ) : (
          <p className="text-body-sm text-fg-secondary">No supporting sentence was found in the document.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
