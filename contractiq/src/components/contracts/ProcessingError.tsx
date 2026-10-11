'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/Button';
import { useProcessContract } from '@/hooks/useProcessContract';
import { NON_RETRYABLE_CONTRACT_ERROR_CODES } from '@/lib/api/error-catalog';
import { MAX_PROCESSING_ATTEMPTS } from '@/lib/constants';

export type ProcessingErrorProps = {
  contractId: string;
  error: { code: string; message: string };
  attempts: number;
  customTerms: string[];
};

/** Retry without re-upload, re-sending the contract's existing custom terms (05 §8.4). */
function RetryButton({ contractId, customTerms }: { contractId: string; customTerms: string[] }) {
  const process = useProcessContract(contractId, { from: 'results' });
  return (
    <Button onClick={() => process.mutate(customTerms)} loading={process.isPending}>
      {process.isPending ? 'Retrying…' : 'Try again'}
    </Button>
  );
}

export function ProcessingError({ contractId, error, attempts, customTerms }: ProcessingErrorProps) {
  // A rejected request (e.g. a misconfigured model) fails identically on every retry: no button, contact support.
  const rejected = NON_RETRYABLE_CONTRACT_ERROR_CODES.includes(error.code);
  const canRetry = !rejected && attempts < MAX_PROCESSING_ATTEMPTS;
  return (
    <section
      role="alert"
      data-error-code={error.code}
      className="flex flex-col gap-4 rounded-lg border border-danger-border bg-danger-bg p-6"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-danger-fg" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-body-lg text-fg-primary">We couldn&apos;t finish analysing this contract</h2>
          <p className="text-body-sm text-fg-secondary">{canRetry || rejected ? error.message : 'This contract has failed too many times.'}</p>
        </div>
      </div>
      {rejected ? null : canRetry ? (
        <div className="flex flex-wrap items-center gap-3">
          <RetryButton contractId={contractId} customTerms={customTerms} />
          <p className="text-body-sm text-fg-secondary">You won&apos;t need to upload the file again.</p>
        </div>
      ) : (
        <Link href="/contracts/new" className={buttonClasses('primary', 'md', 'w-fit')}>
          Upload again
        </Link>
      )}
    </section>
  );
}
