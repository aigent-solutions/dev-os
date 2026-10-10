'use client';

import { isAuthError, isAuthRetryableFetchError, isAuthWeakPasswordError, type AuthError } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env.public';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { LoginInput, SignupInput } from '@/lib/validation/auth';

// Browser-side auth actions (01-auth.md §6.3). No custom API routes: Supabase Auth is called directly.
export const AUTH_TIMEOUT_MS = 10_000;

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_exists'
  | 'weak_password'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; kind: AuthErrorKind; message: string };

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: 'Incorrect email or password',
  email_not_confirmed: 'Please verify your email — check your inbox for the link.',
  email_exists: 'An account with this email already exists — sign in instead',
  weak_password: 'Choose a stronger password (letters and numbers, 8+ characters).',
  rate_limited: 'Too many attempts — please wait a minute and try again.',
  timeout: 'This is taking longer than expected — please try again.',
  network: "We couldn't reach the server. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};

const fail = (kind: AuthErrorKind, message = MESSAGES[kind]): AuthResult => ({ ok: false, kind, message });

/** The callback URL in verification emails sent from the client (signUp / resend). */
function emailRedirectTo(): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=%2Fdashboard`;
}

export function mapAuthError(error: AuthError | Error | unknown): AuthResult {
  if (isAuthRetryableFetchError(error)) return fail('network');
  if (isAuthError(error)) {
    if (error.status === 0) return fail('network');
    switch (error.code) {
      case 'invalid_credentials':
        return fail('invalid_credentials');
      case 'email_not_confirmed':
        return fail('email_not_confirmed');
      case 'user_already_exists':
      case 'email_exists':
        return fail('email_exists');
      case 'weak_password': {
        const reason = isAuthWeakPasswordError(error) ? error.reasons?.[0] : undefined;
        return fail('weak_password', reason ? weakPasswordReason(reason) : MESSAGES.weak_password);
      }
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return fail('rate_limited');
    }
    if (error.status === 429) return fail('rate_limited');
  }
  if (error instanceof TypeError) return fail('network'); // fetch failed before Supabase classified it
  return fail('unknown');
}

function weakPasswordReason(reason: string): string {
  switch (reason) {
    case 'length':
      return 'Use at least 8 characters';
    case 'characters':
      return 'Include at least one letter and one number';
    case 'pwned':
      return 'This password has appeared in a data breach. Choose a different one.';
    default:
      return MESSAGES.weak_password;
  }
}

/** Races the call against AUTH_TIMEOUT_MS. The request itself isn't cancelled. */
async function withAuthTimeout(run: () => Promise<AuthResult>): Promise<AuthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AuthResult>((resolve) => {
    timer = setTimeout(() => resolve(fail('timeout')), AUTH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run().catch((err: unknown) => mapAuthError(err)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function signUpWithEmail({ email, password }: SignupInput): Promise<AuthResult> {
  return withAuthTimeout(async () => {
    const { data, error } = await createBrowserSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) return mapAuthError(error);
    // With confirmations on, an existing confirmed email returns a user with no identities and no error.
    if (data.user && (data.user.identities?.length ?? 0) === 0) return fail('email_exists');
    return { ok: true };
  });
}

export function signInWithEmail(input: LoginInput): Promise<AuthResult> {
  return withAuthTimeout(async () => {
    const { error } = await createBrowserSupabase().auth.signInWithPassword(input);
    return error ? mapAuthError(error) : { ok: true };
  });
}

export function resendVerification(email: string): Promise<AuthResult> {
  return withAuthTimeout(async () => {
    const { error } = await createBrowserSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    return error ? mapAuthError(error) : { ok: true };
  });
}

/** Local sign-out: clears the session cookies even if the revoke request fails. */
export async function signOut(): Promise<void> {
  try {
    await createBrowserSupabase().auth.signOut({ scope: 'local' });
  } catch {
    // Callers still clear local state and navigate (01-auth.md §8.5).
  }
}
