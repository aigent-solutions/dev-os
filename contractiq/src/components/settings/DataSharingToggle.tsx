'use client';

import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/Toast';
import { useProfile, useUpdateProfile } from '@/hooks/useUpdateProfile';
import type { Profile } from '@/types/api';

/** Data-sharing consent, saved on toggle (optimistic; reverts on error) (13 §8.4). */
export function DataSharingToggle({ initialProfile }: { initialProfile: Profile }) {
  const { data: profile } = useProfile(initialProfile);
  const update = useUpdateProfile();
  return (
    <Card as="section" padding="lg" aria-labelledby="data-sharing-title" className="flex flex-col gap-6">
      <h2 id="data-sharing-title" className="text-h5 text-fg-primary">
        Data sharing
      </h2>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <label htmlFor="feedback-opt-in" className="text-body-lg text-fg-primary">
            Help improve ContractIQ
          </label>
          <p id="feedback-opt-in-description" className="max-w-prose text-body-sm text-fg-secondary">
            Allow your corrections to extracted terms to be used, anonymised, to improve our prompts. Your contract
            text and identity are never shared. You can turn this off at any time.
          </p>
        </div>
        <Switch
          id="feedback-opt-in"
          aria-describedby="feedback-opt-in-description"
          checked={profile.feedback_opt_in}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            update.mutate({ feedback_opt_in: v }, { onSuccess: () => toast({ title: 'Preference saved', tone: 'success' }) })
          }
        />
      </div>
    </Card>
  );
}
