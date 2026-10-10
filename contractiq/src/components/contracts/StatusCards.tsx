'use client';

import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProcessContract } from '@/hooks/useProcessContract';

/** status = pending_upload (06 §2). */
export function UploadIncompleteCard() {
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-4">
      <p className="text-body-lg text-fg-primary">This upload didn&apos;t finish.</p>
      <Link href="/contracts/new" className={buttonClasses('primary', 'md', 'w-fit')}>
        Upload a contract
      </Link>
    </Card>
  );
}

/** status = ready: processing never started (06 §2). */
export function NotAnalysedCard({ contractId, customTerms }: { contractId: string; customTerms: string[] }) {
  const process = useProcessContract(contractId, { from: 'results' });
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-4">
      <p className="text-body-lg text-fg-primary">This contract hasn&apos;t been analysed yet.</p>
      <Button className="w-fit" onClick={() => process.mutate(customTerms)} loading={process.isPending}>
        Analyse contract
      </Button>
    </Card>
  );
}
