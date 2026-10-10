import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/api/errors';
import { createLogger } from '@/lib/logger';
import { fakeSupabase } from '../../../helpers/fake-supabase';

// 13-data-lifecycle-gdpr.md §12 — account erasure ordering, with the admin client mocked.
let fake: ReturnType<typeof fakeSupabase>;
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => fake.client }));
const { deleteAccount, listUserObjectPaths } = await import('@/server/services/account.service');

const U = '11111111-1111-4111-8111-111111111111';
const log = createLogger({ test: true });
const folder = (name: string) => ({ name, id: null, created_at: null });
const file = (name: string) => ({ name, id: `id-${name}`, created_at: new Date().toISOString() });

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

describe('listUserObjectPaths', () => {
  it('pages through 1,000 + 1 entries with offsets', async () => {
    const files = Array.from({ length: 1001 }, (_, i) => file(`f${i}.pdf`));
    fake = fakeSupabase({
      onStorage: ({ method, args }) => {
        if (method !== 'list') return {};
        const [prefix, opts] = args as [string, { limit: number; offset: number }];
        if (prefix === U) return { data: [folder('c1')] };
        return { data: files.slice(opts.offset, opts.offset + opts.limit) };
      },
    });
    const paths = await listUserObjectPaths(fake.client as never, U);
    expect(paths).toHaveLength(1001);
    expect(paths[0]).toBe(`${U}/c1/f0.pdf`);
    const offsets = fake.storageCalls.filter((c) => c.args[0] === `${U}/c1`).map((c) => (c.args[1] as { offset: number }).offset);
    expect(offsets).toEqual([0, 1000]);
  });

  it('a list error → STORAGE_UNAVAILABLE', async () => {
    fake = fakeSupabase({ onStorage: () => ({ data: null, error: { message: 'down' } }) });
    const err = await listUserObjectPaths(fake.client as never, U).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('deleteAccount', () => {
  const twoFiles = ({ method, args }: { method: string; args: unknown[] }) =>
    method === 'list' ? { data: args[0] === U ? [folder('c1')] : [file('a.pdf'), file('b.pdf')] } : {};

  it('removes every object, then deletes the auth user', async () => {
    fake = fakeSupabase({ onStorage: twoFiles });
    await deleteAccount(U, log);
    const removed = fake.storageCalls.filter((c) => c.method === 'remove').flatMap((c) => c.args[0] as string[]);
    expect(removed).toEqual([`${U}/c1/a.pdf`, `${U}/c1/b.pdf`]);
    expect(fake.client.auth.admin.deleteUser).toHaveBeenCalledWith(U);
  });

  it('never deletes the user when a Storage remove fails', async () => {
    fake = fakeSupabase({ onStorage: (c) => (c.method === 'remove' ? { error: { message: 'down' } } : twoFiles(c)) });
    const err = await deleteAccount(U, log).catch((e: unknown) => e);
    expect((err as AppError).code).toBe('STORAGE_UNAVAILABLE');
    expect(fake.client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('never deletes the user when listing fails', async () => {
    fake = fakeSupabase({ onStorage: () => ({ data: null, error: { message: 'down' } }) });
    await deleteAccount(U, log).catch(() => undefined);
    expect(fake.client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('an auth delete error → INTERNAL_ERROR', async () => {
    fake = fakeSupabase({ onStorage: twoFiles, onDeleteUser: () => ({ error: { message: 'nope' } }) });
    expect(((await deleteAccount(U, log).catch((e: unknown) => e)) as AppError).code).toBe('INTERNAL_ERROR');
  });
});
