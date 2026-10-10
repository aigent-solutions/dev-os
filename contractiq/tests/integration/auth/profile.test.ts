import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, count } from '../../helpers/db';
import { createTestUser, deleteTestUser } from '../../helpers/factories';
import { signedInClient } from '../../helpers/supabase';

// 01-auth.md §12 — users can't create a second profile, delete theirs, or touch anyone else's.
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

describe('profile ownership', () => {
  it('a user cannot insert a second profile', async () => {
    const user = await createTestUser();
    created.push(user.id);
    const client = await signedInClient(user);
    const { error } = await client.from('profiles').insert({ id: user.id, email: user.email } as never);
    expect(error).not.toBeNull();
    expect(await count('select count(*) from public.profiles where id = $1', [user.id])).toBe(1);
  });

  it('a user cannot delete their profile', async () => {
    const user = await createTestUser();
    created.push(user.id);
    const client = await signedInClient(user);
    const { data } = await client.from('profiles').delete().eq('id', user.id).select();
    expect(data ?? []).toHaveLength(0);
    expect(await count('select count(*) from public.profiles where id = $1', [user.id])).toBe(1);
  });

  it("a user can neither read nor update another user's profile", async () => {
    const [a, b] = [await createTestUser(), await createTestUser()];
    created.push(a.id, b.id);
    const client = await signedInClient(a);
    const read = await client.from('profiles').select('id').eq('id', b.id);
    expect(read.data ?? []).toHaveLength(0);
    const upd = await client.from('profiles').update({ full_name: 'pwned' }).eq('id', b.id).select();
    expect(upd.data ?? []).toHaveLength(0);
    expect(await count("select count(*) from public.profiles where id = $1 and full_name = 'pwned'", [b.id])).toBe(0);
  });
});
