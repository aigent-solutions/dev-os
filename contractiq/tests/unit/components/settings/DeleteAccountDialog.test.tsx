import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { signOut } from '@/lib/auth/client-auth';
import { renderWithClient } from '../../../helpers/render';

// 13-data-lifecycle-gdpr.md §12.
const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client-auth', () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function open() {
  const user = userEvent.setup();
  renderWithClient(<DeleteAccountDialog />);
  await user.click(screen.getByRole('button', { name: 'Delete account' }));
  return { user, input: screen.getByLabelText('Type DELETE to confirm'), confirm: screen.getByRole('button', { name: 'Delete my account' }) };
}

describe('DeleteAccountDialog', () => {
  it('stays disabled until DELETE is typed; lowercase keeps it disabled', async () => {
    const { user, input, confirm } = await open();
    expect(confirm).toBeDisabled();
    await user.type(input, 'delete');
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'DELET');
    expect(confirm).toBeDisabled();
    await user.type(input, 'E');
    expect(confirm).toBeEnabled();
  });

  it('an API error renders an alert with Try again; the account is not signed out', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiClientError(502, 'STORAGE_UNAVAILABLE', "We couldn't reach file storage. Please try again.", true, {}, null, null));
    const { user, input, confirm } = await open();
    await user.type(input, 'DELETE');
    await user.click(confirm);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't reach file storage");
    expect(signOut).not.toHaveBeenCalled();

    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/?account_deleted=1'));
  });

  it('success → DELETE with the literal confirm, sign out, then land on /', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    const { user, input, confirm } = await open();
    await user.type(input, 'DELETE');
    await user.click(confirm);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/?account_deleted=1'));
    expect(apiFetch).toHaveBeenCalledWith('/api/account', { method: 'DELETE', json: { confirm: 'DELETE' } });
    expect(signOut).toHaveBeenCalled();
  });
});
