'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { Profile } from '@/types/api';

export type ProfilePatch = { full_name?: string | null; feedback_opt_in?: boolean; onboarding_completed?: true };

/**
 * The settings page's profile, seeded by the server render. There is no GET endpoint: mutations keep the
 * cache current, so it never goes stale (13 §7).
 */
export function useProfile(initialProfile: Profile) {
  return useQuery({ queryKey: qk.profile(), queryFn: () => initialProfile, initialData: initialProfile, staleTime: Infinity });
}

/** PATCH /api/account, optimistic (13 §7). On error: snapshot restored and a toast. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => apiFetch<Profile>('/api/account', { method: 'PATCH', json: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.profile() });
      const snapshot = qc.getQueryData<Profile>(qk.profile());
      // onboarding_completed is left out: the server sets that timestamp.
      const fields: Partial<Profile> = {};
      if (patch.full_name !== undefined) fields.full_name = patch.full_name;
      if (patch.feedback_opt_in !== undefined) fields.feedback_opt_in = patch.feedback_opt_in;
      qc.setQueryData<Profile>(qk.profile(), (old) => (old ? { ...old, ...fields } : old));
      return { snapshot };
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.profile(), ctx.snapshot);
      toast({ title: "Couldn't save your changes", description: e instanceof ApiClientError ? e.message : undefined, tone: 'danger' });
    },
    onSuccess: (data) => qc.setQueryData(qk.profile(), data),
  });
}
