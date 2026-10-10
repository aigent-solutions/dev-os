'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import type { ContractType, KeyTerm } from '@/types/domain';
import { KeyTermRow } from './KeyTermRow';
import { KeyTermsSummary } from './KeyTermsSummary';
import { GlossaryInfo } from './TermInfo';

export type KeyTermsPanelProps = { contractId: string; contractType: ContractType; pageCount: number; terms: KeyTerm[] };

/** Terms in display_order — never re-sorted by confidence (06 §8.8). */
export function KeyTermsPanel({ contractId, contractType, pageCount, terms }: KeyTermsPanelProps) {
  const sorted = useMemo(() => [...terms].sort((a, b) => a.display_order - b.display_order), [terms]);
  const selectedTermId = useResultsViewerStore((s) => s.highlightTermId);
  const goToPage = useResultsViewerStore((s) => s.goToPage);
  const [announcement, setAnnouncement] = useState('');

  const onSelect = (term: KeyTerm) => {
    if (term.page_number === null) {
      useResultsViewerStore.setState({ highlightTermId: term.id, highlightText: null });
      setAnnouncement('');
      requestAnimationFrame(() => setAnnouncement('This term was not found in the document'));
      return;
    }
    setAnnouncement('');
    goToPage(term.page_number, { termId: term.id, text: term.source_sentence });
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-body-lg text-fg-primary">No key terms were extracted for this contract. Please upload it again.</p>
        <Link href="/contracts/new" className="w-fit text-body-sm text-fg-link underline-offset-2 hover:underline">
          Upload a contract
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <KeyTermsSummary terms={sorted} />
        <GlossaryInfo term="confidence" label="confidence" />
      </div>
      <ul aria-label="Key terms" className="flex flex-col gap-2">
        {sorted.map((term, i) => (
          <KeyTermRow
            key={term.id}
            term={term}
            contractId={contractId}
            contractType={contractType}
            pageCount={pageCount}
            isSelected={selectedTermId === term.id}
            onSelect={onSelect}
            isFirst={i === 0}
          />
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
