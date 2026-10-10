import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddCustomTermInput } from '@/components/upload/AddCustomTermInput';

// 04-term-preview-custom-terms.md §12.
function setup(count = 0, onAdd = vi.fn(() => ({ ok: true }))) {
  const utils = render(<AddCustomTermInput count={count} onAdd={onAdd} disabled={false} />);
  return { ...utils, onAdd, user: userEvent.setup() };
}

describe('AddCustomTermInput', () => {
  it('Enter adds and keeps the input open and empty for the next term', async () => {
    const { user, onAdd } = setup();
    await user.click(screen.getByRole('button', { name: 'Add Key Term' }));
    const input = screen.getByRole('textbox', { name: 'Custom key term' });
    await user.type(input, 'Audit rights{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Audit rights');
    expect(input).toHaveValue('');
    expect(input).toBeInTheDocument();
  });

  it('Escape cancels and returns focus to the trigger', async () => {
    const { user, onAdd } = setup();
    await user.click(screen.getByRole('button', { name: 'Add Key Term' }));
    await user.type(screen.getByRole('textbox', { name: 'Custom key term' }), 'Half typed{Escape}');
    expect(onAdd).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Key Term' })).toHaveFocus());
  });

  it('the counter reflects the count', async () => {
    const { user } = setup(3);
    await user.click(screen.getByRole('button', { name: 'Add Key Term' }));
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
  });

  it('disabled at 5 with an explanation', () => {
    setup(5);
    expect(screen.getByRole('button', { name: 'Add Key Term' })).toBeDisabled();
    expect(screen.getByText('Maximum 5 custom terms')).toBeInTheDocument();
  });

  it('a rejected term shows the message in a role="alert" and keeps the draft', async () => {
    const { user } = setup(0, vi.fn(() => ({ ok: false, message: '"Governing Law" is already a standard term.' })));
    await user.click(screen.getByRole('button', { name: 'Add Key Term' }));
    const input = screen.getByRole('textbox', { name: 'Custom key term' });
    await user.type(input, 'Governing Law{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('already a standard term');
    expect(input).toHaveValue('Governing Law');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
