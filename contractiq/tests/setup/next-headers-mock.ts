import { vi } from 'vitest';

/**
 * Route handlers call next/headers cookies(), which only works inside a Next.js request.
 * Integration tests call handlers directly (tests/helpers/supabase.ts callRoute), so cookies()
 * reads from this jar instead.
 */
const jar = new Map<string, string>();

export const cookieJar = {
  reset(cookies: { name: string; value: string }[]) {
    jar.clear();
    cookies.forEach((c) => jar.set(c.name, c.value));
  },
  /** What route code wrote through cookies().set(), e.g. a new session after the auth callback. */
  entries(): { name: string; value: string }[] {
    return [...jar].map(([name, value]) => ({ name, value }));
  },
};

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
    has: (name: string) => jar.has(name),
  }),
  headers: () => new Headers(),
}));
