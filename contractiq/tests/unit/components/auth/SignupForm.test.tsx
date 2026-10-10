import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EMAIL_KEY, SignupForm } from '@/components/auth/SignupForm';
import { signUpWithEmail } from '@/lib/auth/client-auth';

// 01-auth.md §12.
const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client-auth', () => ({ signUpWithEmail: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

const rule = (label: string) => within(screen.getByRole('list', { name: 'Password requirements' })).getByText(label).closest('li')!;

describe('SignupForm', () => {
  it('the password checklist updates as you type', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    expect(rule('A letter')).toHaveTextContent('(not met)');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'abc');
    expect(rule('A letter')).toHaveTextContent('(met)');
    expect(rule('A number')).toHaveTextContent('(not met)');
    expect(rule('8+ characters')).toHaveTextContent('(not met)');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), '12345');
    expect(rule('A number')).toHaveTextContent('(met)');
    expect(rule('8+ characters')).toHaveTextContent('(met)');
  });

  it('email_exists → banner with a link to /login', async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue({ ok: false, kind: 'email_exists', message: 'An account with this email already exists — sign in instead' });
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText('Email'), 'alice@contractiq.test');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const link = await screen.findByRole('link', { name: 'sign in instead' });
    expect(link).toHaveAttribute('href', '/login');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('success → stores the email and goes to /verify-email', async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText('Email'), 'New@ContractIQ.test');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/verify-email'));
    expect(sessionStorage.getItem(PENDING_EMAIL_KEY)).toBe('new@contractiq.test');
  });

  it('a weak password is caught before calling Supabase', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'abcdefgh');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Include at least one number')).toBeInTheDocument();
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });
});
