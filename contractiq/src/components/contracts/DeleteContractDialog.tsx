'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { useDeleteContract } from '@/hooks/useDeleteContract';
import { ApiClientError } from '@/lib/api-client';

const TITLE_MAX = 60;
const FALLBACK_ERROR = 'Something went wrong on our side. Please try again.';

export type DeleteContractDialogProps = {
  contractId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

/**
 * In-app delete confirmation (13 §8.2). Controlled, so it can open from a row menu item. Focus starts on
 * Cancel (first control); Esc, overlay and × do nothing while deleting. Errors keep the dialog open.
 */
export function DeleteContractDialog({ contractId, fileName, open, onOpenChange, onDeleted }: DeleteContractDialogProps) {
  const del = useDeleteContract();
  const [error, setError] = useState<string | null>(null);
  const submitting = del.isPending;

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const shortName = fileName.length > TITLE_MAX ? `${fileName.slice(0, TITLE_MAX - 1)}…` : fileName;

  function confirm() {
    setError(null);
    del.mutate(contractId, {
      onSuccess: () => {
        onOpenChange(false);
        toast({ title: 'Contract deleted', tone: 'success' });
        onDeleted?.();
      },
      onError: (e) => {
        const message = e instanceof ApiClientError ? e.message : FALLBACK_ERROR;
        setError(message);
        toast({ title: "Couldn't delete the contract", description: message, tone: 'danger' });
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
      title={`Delete "${shortName}"?`}
      description="This permanently deletes the contract, its key terms, chat history and feedback. This can't be undone."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} loading={submitting}>
            Delete contract
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-body-sm text-danger-fg">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </Dialog>
  );
}
