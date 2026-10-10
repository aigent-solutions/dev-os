import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 01-auth.md §12 — error mapping, timeout and redirect URL, with the Supabase browser client mocked.
const auth = { signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn(), signOut: vi.fn() };
vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabase: () => ({ auth }) }));

const { AUTH_TIMEOUT_MS, mapAuthError, resendVerification, signInWithEmail, signUpWithEmail } = await import('@/lib/auth/client-auth');

const apiError = (code: string, status = 400) => new AuthApiError('x', status, code);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('mapAuthError (§6.3 table)', () => {
  it.each([
    [apiError('invalid_credentials'), 'invalid_credentials', 'Incorrect email or password'],
    [apiError('email_not_confirmed'), 'email_not_confirmed', 'Please verify your email — check your inbox for the link.'],
    [apiError('user_already_exists', 422), 'email_exists', 'An account with this email already exists — sign in instead'],
    [apiError('email_exists', 422), 'email_exists', 'An account with this email already exists — sign in instead'],
    [apiError('over_request_rate_limit', 429), 'rate_limited', 'Too many attempts — please wait a minute and try again.'],
    [apiError('over_email_send_rate_limit', 429), 'rate_limited', 'Too many attempts — please wait a minute and try again.'],
    [apiError('something_new', 429), 'rate_limited', 'Too many attempts — please wait a minute and try again.'],
    [new AuthRetryableFetchError('fetch failed', 0), 'network', "We couldn't reach the server. Check your connection and try again."],
    [apiError('anything', 0), 'network', "We couldn't reach the server. Check your connection and try again."],
    [new TypeError('Failed to fetch'), 'network', "We couldn't reach the server. Check your connection and try again."],
    [apiError('unexpected_failure', 500), 'unknown', 'Something went wrong. Please try again.'],
    [new Error('boom'), 'unknown', 'Something went wrong. Please try again.'],
  ])('%s → %s', (err, kind, message) => {
    expect(mapAuthError(err)).toEqual({ ok: false, kind, message });
  });

  it('weak_password uses the first reason', () => {
    expect(mapAuthError(new AuthWeakPasswordError('weak', 422, ['pwned']))).toMatchObject({
      kind: 'weak_password',
      message: 'This password has appeared in a data breach. Choose a different one.',
    });
  });

  it('weak_password without a known reason uses the generic message', () => {
    expect(mapAuthError(apiError('weak_password', 422))).toMatchObject({
      kind: 'weak_password',
      message: 'Choose a stronger password (letters and numbers, 8+ characters).',
    });
  });
});

describe('signUpWithEmail', () => {
  it('an existing confirmed email (user with no identities, no error) → email_exists', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u', identities: [] } }, error: null });
    expect(await signUpWithEmail({ email: 'a@b.co', password: 'Password123' })).toMatchObject({ ok: false, kind: 'email_exists' });
  });

  it('success; emailRedirectTo is built from NEXT_PUBLIC_APP_URL', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u', identities: [{}] } }, error: null });
    expect(await signUpWithEmail({ email: 'a@b.co', password: 'Password123' })).toEqual({ ok: true });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'Password123',
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=%2Fdashboard` },
    });
  });

  it('a thrown network error is mapped, not rethrown', async () => {
    auth.signUp.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await signUpWithEmail({ email: 'a@b.co', password: 'Password123' })).toMatchObject({ kind: 'network' });
  });
});

describe('timeouts', () => {
  it('a call that never settles resolves to timeout after 10 s', async () => {
    vi.useFakeTimers();
    auth.signInWithPassword.mockReturnValue(new Promise(() => undefined));
    const pending = signInWithEmail({ email: 'a@b.co', password: 'x' });
    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, kind: 'timeout', message: 'This is taking longer than expected — please try again.' });
  });
});

describe('resendVerification', () => {
  it('resends a signup email with the same redirect', async () => {
    auth.resend.mockResolvedValue({ error: null });
    expect(await resendVerification('a@b.co')).toEqual({ ok: true });
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@b.co',
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=%2Fdashboard` },
    });
  });
});
