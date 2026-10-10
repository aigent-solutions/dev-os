'use client';

import { useState } from 'react';
import { GlossaryInfo } from '@/components/key-terms/TermInfo';
import { Banner } from '@/components/ui/Banner';
import type { ContractType, DetectedContractType } from '@/types/domain';

/** Shown only when the model's detected type differs from the selected one (06 §8.6). Dismiss is memory-only. */
export function TypeMismatchBanner({ selected, detected }: { selected: ContractType; detected: DetectedContractType }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || detected === selected) return null;
  const sel = selected.toUpperCase();
  const copy =
    detected === 'other'
      ? `This doesn't look like an ${sel}. Some terms may be missing.`
      : `This looks like an ${detected.toUpperCase()} rather than an ${sel}. Some terms may be missing.`;
  return (
    <Banner tone="warning" onDismiss={() => setDismissed(true)} dismissLabel="Dismiss contract type warning">
      <span className="inline-flex flex-wrap items-center gap-1">
        {copy}
        <GlossaryInfo term="type_mismatch" label="a contract type mismatch" />
      </span>
    </Banner>
  );
}
