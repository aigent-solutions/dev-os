'use client';

import { ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DeleteContractDialog } from '@/components/contracts/DeleteContractDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { IconButton } from '@/components/ui/IconButton';

/**
 * Row actions: Open, Delete (10 §8). The dialog is a sibling so it outlives the closed menu and opens once the
 * menu has closed. Radix returns focus only to a Dialog.Trigger, which this dialog has none of, so closing it
 * refocuses the ⋯ button here (13 §11). After a successful delete the row, and its button, are gone.
 */
export function ContractRowMenu({ contractId, fileName }: { contractId: string; fileName: string }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteRequested = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onDeleteOpenChange = (open: boolean) => {
    setDeleteOpen(open);
    if (!open) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton ref={triggerRef} icon={MoreHorizontal} label={`Actions for ${fileName}`} size="sm" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={() => {
            if (!deleteRequested.current) return;
            deleteRequested.current = false;
            setDeleteOpen(true);
          }}
        >
          <DropdownMenuItem onSelect={() => router.push(`/contracts/${contractId}`)}>
            <ExternalLink aria-hidden className="h-4 w-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={() => (deleteRequested.current = true)}>
            <Trash2 aria-hidden className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteContractDialog contractId={contractId} fileName={fileName} open={deleteOpen} onOpenChange={onDeleteOpenChange} />
    </>
  );
}
