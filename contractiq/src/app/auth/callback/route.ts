import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/safe-next';
import { logger } from '@/lib/logger';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OTP_TYPES = new Set(['email', 'signup']);

/**
 * Turns an email-verification link into a session cookie (01-auth.md §5).
 * Primary path: ?token_hash=&type=email from the email template — works in any browser, no PKCE verifier.
 * Fallback: ?code= (PKCE) when Supabase redirects to emailRedirectTo.
 * Not wrapped in withApiHandler: it returns redirects, not JSON.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const code = params.get('code');
  const next = safeNext(params.get('next'));

  let reason: string | null = null;
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await createServerSupabase().auth.verifyOtp({ type: 'email', token_hash: tokenHash });
    if (error) reason = error.code ?? 'verify_failed';
  } else if (code) {
    const { error } = await createServerSupabase().auth.exchangeCodeForSession(code);
    if (error) reason = error.code ?? 'exchange_failed';
  } else {
    reason = 'missing_params';
  }

  const target = reason ? '/login?error=verification_failed' : next;
  if (reason) logger.warn('auth_callback_failed', { reason }); // never log the email or token
  const response = NextResponse.redirect(new URL(target, request.url), 302); // spec 01 §5: 302
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
