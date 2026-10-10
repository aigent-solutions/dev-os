'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { useProfile, useUpdateProfile } from '@/hooks/useUpdateProfile';
import { ProfileNameFormSchema, type ProfileNameFormInput } from '@/lib/validation/account';
import type { Profile } from '@/types/api';

function planLabel(p: Profile): string {
  if (p.plan === 'trial') return p.trial_ends_at ? `Free trial — ends ${format(new Date(p.trial_ends_at), 'd MMM yyyy')}` : 'Free trial';
  return p.plan.charAt(0).toUpperCase() + p.plan.slice(1);
}

/** Email and plan (read-only) and the full name form (13 §8.3). */
export function ProfileSection({ initialProfile }: { initialProfile: Profile }) {
  const { data: profile } = useProfile(initialProfile);
  const update = useUpdateProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileNameFormInput>({
    resolver: zodResolver(ProfileNameFormSchema),
    defaultValues: { full_name: profile.full_name ?? '' },
  });

  const onSubmit = (v: ProfileNameFormInput) =>
    update.mutate(
      { full_name: v.full_name },
      {
        onSuccess: (saved) => {
          toast({ title: 'Profile saved', tone: 'success' });
          reset({ full_name: saved.full_name ?? '' });
        },
      },
    );

  return (
    <Card as="section" padding="lg" aria-labelledby="profile-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="profile-title" className="text-h5 text-fg-primary">
          Profile
        </h2>
        <p className="text-body-sm text-fg-secondary">How you appear in ContractIQ.</p>
      </div>
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-body-sm font-medium text-fg-primary">Email</dt>
          <dd className="break-all text-body-lg text-fg-secondary">{profile.email}</dd>
          <dd className="text-body-sm text-fg-secondary">Email changes are not supported yet</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-body-sm font-medium text-fg-primary">Plan</dt>
          <dd className="text-body-lg text-fg-secondary">{planLabel(profile)}</dd>
        </div>
      </dl>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label="Full name" name="full_name" error={errors.full_name?.message} hint="Optional">
          {(field) => <Input {...field} {...register('full_name')} maxLength={120} autoComplete="name" className="max-w-96" />}
        </FormField>
        <div>
          <Button type="submit" disabled={!isDirty} loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
