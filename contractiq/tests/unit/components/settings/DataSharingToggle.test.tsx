import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSharingToggle } from '@/components/settings/DataSharingToggle';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { Profile } from '@/types/api';
import { renderWithClient } from '../../../helpers/render';

// 13-data-lifecycle-gdpr.md §12 — optimistic, reverts on error.
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

const profile: Profile = {
  id: 'u', email: 'a@b.co', full_name: null, plan: 'trial', trial_ends_at: null, feedback_opt_in: false,
  onboarding_completed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
} as Profile;

describe('DataSharingToggle', () => {
  it('flips immediately and stays on after a successful save', async () => {
    let resolve!: (p: Profile) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderWithClient(<DataSharingToggle initialProfile={profile} />);
    const toggle = screen.getByRole('switch', { name: 'Help improve ContractIQ' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true'); // optimistic, before the API answers
    expect(apiFetch).toHaveBeenCalledWith('/api/account', { method: 'PATCH', json: { feedback_opt_in: true } });
    resolve({ ...profile, feedback_opt_in: true });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('reverts when the save fails', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiClientError(500, 'INTERNAL_ERROR', 'boom', true, {}, null, null));
    renderWithClient(<DataSharingToggle initialProfile={profile} />);
    const toggle = screen.getByRole('switch', { name: 'Help improve ContractIQ' });
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });
});
