// Safe post-auth redirect targets (01-auth.md §6.1). Only same-origin relative paths are allowed;
// the auth pages themselves are never valid targets.
const AUTH_PATHS = ['/login', '/signup', '/auth/callback'];

export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || typeof next !== 'string' || next.length > 512) return false;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return false;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\\]/.test(next)) return false;
  let url: URL;
  try {
    url = new URL(next, 'http://x.invalid');
  } catch {
    return false;
  }
  if (url.origin !== 'http://x.invalid') return false;
  return !AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
}

export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  return isSafeNext(next) ? next : fallback;
}
