import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteContractDialog } from '@/components/contracts/DeleteContractDialog';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { renderWithClient } from '../../../helpers/render';

// 13-data-lifecycle-gdpr.md §12.
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

const ID = '22222222-2222-4222-8222-222222222222';
function setup() {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  renderWithClient(<DeleteContractDialog contractId={ID} fileName="Acme NDA.pdf" open onOpenChange={onOpenChange} onDeleted={onDeleted} />);
  return { onOpenChange, onDeleted, user: userEvent.setup() };
}

describe('DeleteContractDialog', () => {
  it('opens with focus on Cancel', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('while deleting, both buttons are disabled', async () => {
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(() => undefined));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete contract' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Delete contract' })).toBeDisabled();
  });

  it('a 404 counts as deleted', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiClientError(404, 'NOT_FOUND', 'Not found', false, {}, null, null));
    const { user, onOpenChange, onDeleted } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete contract' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiFetch).toHaveBeenCalledWith(`/api/contracts/${ID}`, { method: 'DELETE' });
  });

  it('any other error keeps the dialog open with an alert', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiClientError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.', true, {}, null, null));
    const { user, onDeleted, onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete contract' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
