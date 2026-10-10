import { Card } from '@/components/ui/Card';
import { DeleteAccountDialog } from './DeleteAccountDialog';

/** Account deletion entry point (13 §8.5). Red border marks the destructive area. */
export function DangerZoneCard() {
  return (
    <Card as="section" padding="lg" aria-labelledby="danger-title" className="flex flex-col gap-6 border-danger-border">
      <div className="flex flex-col gap-0.5">
        <h2 id="danger-title" className="text-h5 text-fg-primary">
          Delete account
        </h2>
        <p className="text-body-sm text-fg-secondary">
          Permanently delete your account, all contracts, uploaded PDFs, extracted terms, chat history and feedback.
        </p>
      </div>
      <DeleteAccountDialog />
    </Card>
  );
}
