'use client';

import { useState, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { CONFIDENCE_LOW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ContractType, KeyTerm } from '@/types/domain';
import { ConfidenceBadge } from './ConfidenceBadge';
import { EditedBadge } from './EditedBadge';
import { InlineTermEditor } from './InlineTermEditor';
import { LowConfidenceWarning } from './LowConfidenceWarning';
import { PageLink } from './PageLink';
import { SourceSentenceDisclosure } from './SourceSentenceDisclosure';
import { GlossaryInfo, TermInfo } from './TermInfo';

export type KeyTermRowProps = {
  term: KeyTerm;
  contractId: string;
  contractType: ContractType;
  pageCount: number;
  isSelected: boolean;
  onSelect: (term: KeyTerm) => void;
  /** First row carries the onboarding anchors (14-onboarding-a11y.md). */
  isFirst?: boolean;
};

const INTERACTIVE = 'button, a, input, textarea, [data-no-row-select]';

/** One extracted term. Never hidden or collapsed because of its confidence (FR-11, 06 §8.10). */
export function KeyTermRow({ term, contractId, contractType, pageCount, isSelected, onSelect, isFirst = false }: KeyTermRowProps) {
  const [saving, setSaving] = useState(false);
  const description = term.is_custom
    ? null
    : (TERM_LIBRARY[contractType].find((t) => t.key === term.term_key)?.description ?? null);

  // Mouse convenience: clicking empty card area selects the term.
  const onCardClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    onSelect(term);
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- keyboard users select via the term name button
    <li
      aria-current={isSelected || undefined}
      aria-busy={saving || undefined}
      onClick={onCardClick}
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-lg border bg-surface p-3 transition-colors duration-100 ease-out',
        isSelected ? 'border-transparent ring-2 ring-inset ring-brand' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(term)}
            aria-label={`Show ${term.term_name} in the document`}
            className="rounded-sm text-left text-body-lg text-fg-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {term.term_name}
          </button>
          {term.is_custom && (
            <>
              <Badge tone="accent">Custom</Badge>
              <GlossaryInfo term="custom_term" label="a custom term" />
            </>
          )}
          {description && <TermInfo label={term.term_name} description={description} />}
        </div>
        <ConfidenceBadge score={term.confidence_score} {...(isFirst ? { 'data-onboarding': 'confidence-badge' } : {})} />
      </div>

      <InlineTermEditor term={term} contractId={contractId} pageCount={pageCount} onSavingChange={setSaving} />

      <div className="flex flex-wrap items-center gap-3">
        <PageLink page={term.page_number} onGo={() => onSelect(term)} />
        <EditedBadge term={term} contractId={contractId} />
        {term.confidence_score < CONFIDENCE_LOW && <LowConfidenceWarning termName={term.term_name} />}
      </div>

      <SourceSentenceDisclosure
        sourceSentence={term.source_sentence}
        sourceVerified={term.source_verified}
        termName={term.term_name}
        {...(isFirst ? { 'data-onboarding': 'why-toggle' } : {})}
      />
    </li>
  );
}
