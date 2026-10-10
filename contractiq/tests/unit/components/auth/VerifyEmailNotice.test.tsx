import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EMAIL_KEY } from '@/components/auth/SignupForm';
import { VerifyEmailNotice } from '@/components/auth/VerifyEmailNotice';
import { resendVerification } from '@/lib/auth/client-auth';

// 01-auth.md §12.
vi.mock('@/lib/auth/client-auth', () => ({ resendVerification: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('VerifyEmailNotice', () => {
  it('shows the stored email', () => {
    sessionStorage.setItem(PENDING_EMAIL_KEY, 'new@contractiq.test');
    render(<VerifyEmailNotice />);
    expect(screen.getByText('new@contractiq.test')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('resend starts a 60 s cooldown that counts down', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionStorage.setItem(PENDING_EMAIL_KEY, 'new@contractiq.test');
    vi.mocked(resendVerification).mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<VerifyEmailNotice />);
    await user.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(resendVerification).toHaveBeenCalledWith('new@contractiq.test');
    expect(await screen.findByRole('button', { name: 'Resend in 60s' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('button', { name: 'Resend in 59s' })).toBeInTheDocument();
    // Each tick schedules the next after a re-render, so step second by second like real time.
    for (let i = 0; i < 59; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled();
  });

  it('without a stored email: shows an input and validates it', async () => {
    const user = userEvent.setup();
    render(<VerifyEmailNotice />);
    expect(screen.getByText('We sent a verification link to your email address.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(resendVerification).not.toHaveBeenCalled();
  });
});
