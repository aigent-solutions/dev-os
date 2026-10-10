import { describe, expect, it } from 'vitest';
import { isSafeNext, safeNext } from '@/lib/auth/safe-next';

// 01-auth.md §12 — post-auth redirects never leave the origin or loop back into auth pages.
describe('safeNext', () => {
  it.each(['/dashboard', '/contracts/abc?x=1', '/settings#data'])('accepts %s', (next) => {
    expect(isSafeNext(next)).toBe(true);
    expect(safeNext(next)).toBe(next);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['absolute URL', 'https://evil.com'],
    ['protocol-relative', '//evil.com'],
    ['backslash trick', '/\\evil.com'],
    ['javascript:', 'javascript:alert(1)'],
    ['no leading slash', 'dashboard'],
    ['control character', '/dash\nboard'],
    ['tab', '/dash\tboard'],
    ['embedded backslash', '/foo\\bar'],
    ['too long', '/' + 'a'.repeat(512)],
    ['/login', '/login'],
    ['/login?next=…', '/login?next=/dashboard'],
    ['/signup', '/signup'],
    ['/auth/callback', '/auth/callback?code=x'],
  ])('rejects %s → /dashboard', (_label, next) => {
    expect(isSafeNext(next as string)).toBe(false);
    expect(safeNext(next as string)).toBe('/dashboard');
  });

  it('uses a custom fallback', () => {
    expect(safeNext('//evil.com', '/settings')).toBe('/settings');
  });

  it('accepts exactly 512 characters', () => {
    expect(isSafeNext('/' + 'a'.repeat(511))).toBe(true);
  });
});
