import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/LoginForm';
import { resendVerification, signInWithEmail } from '@/lib/auth/client-auth';

// 01-auth.md §12.
const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client-auth', () => ({ signInWithEmail: vi.fn(), resendVerification: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function submit(email = 'alice@contractiq.test', password = 'Password123') {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password', { selector: 'input' }), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('LoginForm', () => {
  it('shows required-field errors and does not call Supabase', async () => {
    render(<LoginForm />);
    await submit('', '');
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it('wrong credentials → a generic banner that takes focus', async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ ok: false, kind: 'invalid_credentials', message: 'Incorrect email or password' });
    render(<LoginForm />);
    await submit();
    const banner = await screen.findByText('Incorrect email or password');
    await waitFor(() => expect(banner.closest('[tabindex]')).toHaveFocus());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('email_not_confirmed → resend button calls resendVerification with the typed email', async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ ok: false, kind: 'email_not_confirmed', message: 'Please verify your email — check your inbox for the link.' });
    vi.mocked(resendVerification).mockResolvedValue({ ok: true });
    render(<LoginForm />);
    const user = await submit('Alice@ContractIQ.test');
    await user.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    expect(resendVerification).toHaveBeenCalledWith('alice@contractiq.test');
    expect(await screen.findByText('Verification email sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend in \d+s/ })).toBeDisabled();
  });

  it('success → router.replace(next)', async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ ok: true });
    render(<LoginForm next="/contracts/abc" />);
    await submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/contracts/abc'));
  });

  it('an unsafe next falls back to /dashboard', async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ ok: true });
    render(<LoginForm next="https://evil.com" />);
    await submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows the initialError banner', () => {
    render(<LoginForm initialError="verification_failed" />);
    expect(screen.getByText(/verification link is invalid or has expired/)).toBeInTheDocument();
  });
});
