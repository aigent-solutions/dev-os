'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Input } from './Input';
import { Label } from './Label';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
  /** Typed confirmation (e.g. "DELETE"): the confirm button stays disabled until it matches exactly. */
  confirmText?: string;
};

/** Replaces the browser confirm(). The confirm button shows loading while onConfirm is pending. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  confirmText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const blocked = confirmText !== undefined && typed !== confirmText;

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            loading={pending}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmText !== undefined && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={inputId}>Type {confirmText} to confirm</Label>
          <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
    </Dialog>
  );
}
