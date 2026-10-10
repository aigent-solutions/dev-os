'use client';

import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { MAX_CUSTOM_TERMS } from '@/lib/constants';
import type { ContractType } from '@/types/domain';
import { AddCustomTermInput } from './AddCustomTermInput';
import { TermPreviewItem } from './TermPreviewItem';

export type TermPreviewCardProps = {
  contractType: ContractType | null;
  customTerms: string[];
  onAdd: (name: string) => { ok: boolean; message?: string };
  onRemove: (index: number) => void;
  /** True while processing: custom terms are frozen. */
  locked: boolean;
  notice: string | null;
  onDismissNotice: () => void;
};

/** "Terms we'll look for": standard terms for the type, then custom terms (04 §8.1). */
export function TermPreviewCard({ contractType, customTerms, onAdd, onRemove, locked, notice, onDismissNotice }: TermPreviewCardProps) {
  const standard = contractType ? TERM_LIBRARY[contractType] : [];
  return (
    <Card as="section" padding="lg" data-onboarding="term-preview" aria-labelledby="term-preview-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="term-preview-heading" className="text-h5 text-fg-primary">
          Terms we&apos;ll look for
        </h2>
        {contractType && (
          <p className="text-body-sm text-fg-secondary">
            {standard.length} standard terms for {contractType.toUpperCase()} · {customTerms.length}/{MAX_CUSTOM_TERMS} custom
          </p>
        )}
      </div>

      {!contractType ? (
        <p className="text-body-lg font-normal text-fg-secondary">Choose a contract type to see the terms we&apos;ll extract.</p>
      ) : (
        <>
          {notice && (
            <Banner tone="info" onDismiss={onDismissNotice}>
              {notice}
            </Banner>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {standard.map((t) => (
              <TermPreviewItem key={t.key} name={t.name} description={t.description} isCustom={false} disabled={locked} />
            ))}
            {customTerms.map((name, i) => (
              <TermPreviewItem key={`${name}-${i}`} name={name} description={null} isCustom onRemove={() => onRemove(i)} disabled={locked} />
            ))}
          </ul>
          <AddCustomTermInput count={customTerms.length} onAdd={onAdd} disabled={locked} />
        </>
      )}
    </Card>
  );
}
