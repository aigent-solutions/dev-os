import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineTermEditor } from '@/components/key-terms/InlineTermEditor';
import { useUpdateKeyTerm } from '@/hooks/useUpdateKeyTerm';
import { keyTerm } from '../../../helpers/fixtures';
import { renderWithClient } from '../../../helpers/render';

// 08-inline-editing.md §12 — the mutation hook is mocked.
const mutate = vi.fn();
vi.mock('@/hooks/useUpdateKeyTerm', async (orig) => ({ ...(await orig<typeof import('@/hooks/useUpdateKeyTerm')>()), useUpdateKeyTerm: vi.fn() }));
beforeEach(() => {
  mutate.mockReset();
  vi.mocked(useUpdateKeyTerm).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useUpdateKeyTerm>);
});

async function openEditor(pageCount = 6) {
  renderWithClient(
    <div>
      <InlineTermEditor term={keyTerm({ value: 'England and Wales', page_number: 2 })} contractId="c" pageCount={pageCount} />
      <button type="button">outside</button>
    </div>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit Governing Law value' }));
  return { user, value: screen.getByRole('textbox', { name: 'Governing Law value' }), page: screen.getByRole('spinbutton', { name: 'Page' }) };
}

describe('InlineTermEditor', () => {
  it('Enter saves the trimmed value', async () => {
    const { user, value } = await openEditor();
    await user.clear(value);
    await user.type(value, '  Scotland  {Enter}');
    expect(mutate).toHaveBeenCalledWith({ termId: 't-1', value: 'Scotland' }, expect.anything());
  });

  it('Shift+Enter inserts a newline instead of saving', async () => {
    const { user, value } = await openEditor();
    await user.type(value, '{Shift>}{Enter}{/Shift}more');
    expect(mutate).not.toHaveBeenCalled();
    expect(value).toHaveValue('England and Wales\nmore');
  });

  it('Escape restores display mode and focus, without saving', async () => {
    const { user, value } = await openEditor();
    await user.type(value, ' changed{Escape}');
    expect(mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Governing Law value' })).toHaveFocus());
  });

  it('moving focus within the editor (value → page) does not save', async () => {
    const { user, value } = await openEditor();
    await user.type(value, ' x');
    await user.tab(); // to the page input
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toBeInTheDocument();
  });

  it('blurring outside the editor saves a change', async () => {
    const { value } = await openEditor();
    fireEvent.change(value, { target: { value: 'Northern Ireland' } });
    fireEvent.blur(value, { relatedTarget: screen.getByRole('button', { name: 'outside' }) });
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ termId: 't-1', value: 'Northern Ireland' }, expect.anything()));
  });

  it('page 9 with 6 pages → an error, no mutate', async () => {
    const { user, page } = await openEditor(6);
    await user.clear(page);
    await user.type(page, '9{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Page must be between 1 and 6');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('an unchanged value cancels without a request', async () => {
    const { user, value } = await openEditor();
    await user.type(value, '{Enter}');
    expect(mutate).not.toHaveBeenCalled();
  });
});
