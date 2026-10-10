'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ContractDetail } from '@/types/api';
import { DeleteContractDialog } from './DeleteContractDialog';
import { MarkReviewCompleteButton } from './MarkReviewCompleteButton';

/** File name, type, page count, review status and Delete (06 §8.4, 13 §2.1). */
export function ResultsHeader({ contract }: { contract: ContractDetail['contract'] }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const onDeleteOpenChange = (open: boolean) => {
    setDeleteOpen(open);
    if (!open) requestAnimationFrame(() => deleteRef.current?.focus()); // no Dialog.Trigger: refocus by hand
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-6 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate text-h5 text-fg-primary" title={contract.file_name}>
          {contract.file_name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{contract.contract_type.toUpperCase()}</Badge>
          {contract.page_count !== null && (
            <span className="text-body-sm text-fg-secondary">
              {contract.page_count} {contract.page_count === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MarkReviewCompleteButton contractId={contract.id} reviewedAt={contract.review_completed_at} />
        <Button ref={deleteRef} variant="secondary" onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden className="h-4 w-4" />
          Delete
        </Button>
      </div>
      <DeleteContractDialog
        contractId={contract.id}
        fileName={contract.file_name}
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        onDeleted={() => router.replace('/dashboard')}
      />
    </header>
  );
}
