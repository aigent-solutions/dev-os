import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { useSubmitFeedback } from '@/hooks/useSubmitFeedback';
import { ApiClientError } from '@/lib/api-client';
import { renderWithClient } from '../../../helpers/render';

// 11-feedback.md §12 — the hook is mocked; each test decides how the save resolves.
type Opts = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void; onSettled?: () => void };
const mutate = vi.fn();
vi.mock('@/hooks/useSubmitFeedback', () => ({ useSubmitFeedback: vi.fn() }));
beforeEach(() => {
  mutate.mockReset();
  vi.mocked(useSubmitFeedback).mockReturnValue({ mutate } as unknown as ReturnType<typeof useSubmitFeedback>);
});
/** Every save succeeds, echoing what was sent. */
const succeed = () =>
  mutate.mockImplementation((v: { rating: string; accuracy_rating: string | null; comment?: string }, o: Opts) => {
    o.onSuccess?.({ rating: v.rating, accuracy_rating: v.accuracy_rating, comment: v.comment ?? null });
    o.onSettled?.();
  });
const up = () => screen.getByRole('button', { name: 'Yes, helpful' });

describe('FeedbackWidget', () => {
  it('👍 saves { rating: up, accuracy_rating: null } and reveals the optional fields', async () => {
    succeed();
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={null} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.setup().click(up());
    expect(mutate).toHaveBeenCalledWith({ rating: 'up', accuracy_rating: null, comment: undefined }, expect.anything());
    expect(up()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Thanks for your feedback')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Partially' })).toBeInTheDocument();
  });

  it('clicking 👍 again does not save again', async () => {
    succeed();
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={null} />);
    const user = userEvent.setup();
    await user.click(up());
    await user.click(up());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('changing accuracy sends the saved comment, not the unsent draft', async () => {
    succeed();
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={{ rating: 'up', accuracy_rating: null, comment: 'saved note' }} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), ' plus unsent draft');
    await user.click(screen.getByRole('radio', { name: 'Partially' }));
    expect(mutate).toHaveBeenLastCalledWith({ rating: 'up', accuracy_rating: 'partially', comment: 'saved note' }, expect.anything());
  });

  it('"Send comment" is disabled while the draft equals the saved comment', async () => {
    succeed();
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={{ rating: 'down', accuracy_rating: 'no', comment: 'same' }} />);
    const send = screen.getByRole('button', { name: 'Send comment' });
    expect(send).toBeDisabled();
    await userEvent.setup().type(screen.getByRole('textbox'), '!');
    expect(send).toBeEnabled();
  });

  it('on error the thumb reverts and the error text shows', async () => {
    mutate.mockImplementation((_v: unknown, o: Opts) => {
      o.onError?.(new ApiClientError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.', true, {}, null, null));
      o.onSettled?.();
    });
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={null} />);
    await userEvent.setup().click(up());
    await waitFor(() => expect(up()).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByText('Something went wrong on our side. Please try again.')).toBeInTheDocument();
  });

  it('prefill renders the pressed thumb, the answer and the comment', () => {
    renderWithClient(<FeedbackWidget contractId="c" initialFeedback={{ rating: 'down', accuracy_rating: 'partially', comment: 'Missed the cap' }} />);
    expect(screen.getByRole('button', { name: 'No, not helpful' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: 'Partially' })).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('Missed the cap');
  });
});
