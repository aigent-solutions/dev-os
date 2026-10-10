'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { signOut } from '@/lib/auth/client-auth';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';

const CONFIRM = 'DELETE';
const FALLBACK_ERROR = 'Something went wrong on our side. Please try again.';

/**
 * GDPR erasure (13 §2.3, §8.5). Enabled only when the field is exactly DELETE. After 204: sign out, clear
 * caches and stores, land on / with the confirmation toast. On error the account still exists: inline alert
 * + Try again.
 */
export function DeleteAccountDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmText('');
      setError(null);
    }
  }, [open]);

  const onOpenChange = (next: boolean) => {
    if (submitting) return;
    setOpen(next);
    if (!next) requestAnimationFrame(() => triggerRef.current?.focus()); // no Dialog.Trigger: refocus by hand
  };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<void>('/api/account', { method: 'DELETE', json: { confirm: CONFIRM } });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : FALLBACK_ERROR);
      setSubmitting(false);
      return;
    }
    await signOut(); // clears the local session even though the user no longer exists
    queryClient.clear();
    useUploadWizardStore.getState().reset();
    useResultsViewerStore.getState().reset();
    router.replace('/?account_deleted=1');
  }

  const ready = confirmText.trim() === CONFIRM;

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-fit border-danger-solid text-danger-fg hover:bg-danger-bg active:bg-danger-bg"
      >
        Delete account
      </Button>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Delete your account?"
        description="Your account and everything in it will be permanently deleted."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={!ready} loading={submitting}>
              Delete my account
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-1 pl-6 text-body-lg font-normal text-fg-primary">
            <li>Your account and profile</li>
            <li>All contracts and uploaded PDFs</li>
            <li>Extracted key terms and your edits</li>
            <li>Chat history</li>
            <li>Feedback you&apos;ve given</li>
          </ul>
          <p className="text-body-lg text-fg-primary">This can&apos;t be undone.</p>
          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId}>Type {CONFIRM} to confirm</Label>
            <Input
              id={inputId}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
            />
          </div>
          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2">
              <p className="flex items-start gap-2 text-body-sm text-danger-fg">
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
              <Button variant="secondary" size="sm" onClick={submit} disabled={submitting}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
