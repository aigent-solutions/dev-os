import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Session refresh + page route protection (00-foundation.md §6.4).
const PROTECTED_PREFIXES = ['/dashboard', '/contracts', '/settings'];
const AUTH_ONLY_PUBLIC = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) return response; // API routes answer 401 JSON themselves

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectWithCookies(url, response);
  }
  if (user && (pathname === '/' || AUTH_ONLY_PUBLIC.includes(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return redirectWithCookies(url, response);
  }
  return response;
}

/** A redirect must carry any refreshed session cookies, or the user is signed out. */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts/|pdf\\.worker\\.min\\.mjs|demo\\.gif|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2)$).*)',
  ],
};
