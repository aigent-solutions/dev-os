import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditedBadge } from '@/components/key-terms/EditedBadge';
import { useUpdateKeyTerm } from '@/hooks/useUpdateKeyTerm';
import { keyTerm } from '../../../helpers/fixtures';
import { renderWithClient } from '../../../helpers/render';

// 08-inline-editing.md §12.
const mutate = vi.fn();
vi.mock('@/hooks/useUpdateKeyTerm', async (orig) => ({ ...(await orig<typeof import('@/hooks/useUpdateKeyTerm')>()), useUpdateKeyTerm: vi.fn() }));
beforeEach(() => {
  mutate.mockReset();
  vi.mocked(useUpdateKeyTerm).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useUpdateKeyTerm>);
});
const edited = (over = {}) => keyTerm({ value: 'Scotland', is_edited: true, original_value: 'England and Wales', original_page_number: 2, edited_at: new Date().toISOString(), ...over });

describe('EditedBadge', () => {
  it('renders nothing for an unedited term', () => {
    const { container } = renderWithClient(<EditedBadge term={keyTerm()} contractId="c" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the original AI value and restores it with its page', async () => {
    renderWithClient(<EditedBadge term={edited()} contractId="c" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edited\. Original AI value: England and Wales/ }));
    expect(screen.getAllByText('England and Wales').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Restore AI value' }));
    expect(mutate).toHaveBeenCalledWith({ termId: 't-1', value: 'England and Wales', page_number: 2 }, expect.anything());
  });

  it('no "Restore AI value" when the AI found nothing (original_value null)', async () => {
    renderWithClient(<EditedBadge term={edited({ original_value: null, original_page_number: null })} contractId="c" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Edited\./ }));
    expect(screen.queryByRole('button', { name: 'Restore AI value' })).toBeNull();
  });
});
