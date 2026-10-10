'use client';

import { Button } from '@/components/ui/Button';
import { useProcessContract } from '@/hooks/useProcessContract';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';

/** Enabled only in step 'ready'; sends the custom terms in the order shown (05 §8.1). */
export function ProcessContractButton({ contractId, disabled }: { contractId: string | null; disabled: boolean }) {
  const customTerms = useUploadWizardStore((s) => s.customTerms);
  const process = useProcessContract(contractId);
  const pending = process.isPending;
  return (
    <Button
      className="w-full"
      onClick={() => process.mutate(customTerms)}
      disabled={disabled || !contractId}
      loading={pending}
    >
      {pending ? 'Processing…' : 'Process Contract'}
    </Button>
  );
}
