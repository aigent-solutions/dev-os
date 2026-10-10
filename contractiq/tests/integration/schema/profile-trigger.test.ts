import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../../helpers/db';
import { createTestUser, deleteTestUser } from '../../helpers/factories';
import { signedInClient } from '../../helpers/supabase';

// 00-foundation.md §12.3 — handle_new_user trigger + the profiles column grant.
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

const denied = (error: { code?: string; message: string } | null) => !!error && (error.code === '42501' || /permission denied/i.test(error.message));

describe('profiles', () => {
  it('a new auth user gets a trial profile with trial_ends_at ≈ now + 14 days', async () => {
    const user = await createTestUser();
    created.push(user.id);
    const [p] = await sql<{ email: string; plan: string; trial_ends_at: Date }>('select email, plan, trial_ends_at from public.profiles where id = $1', [user.id]);
    expect(p).toBeDefined();
    expect(p!.email).toBe(user.email);
    expect(p!.plan).toBe('trial');
    const days = (p!.trial_ends_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it('the owner can update full_name, feedback_opt_in and onboarding_completed_at', async () => {
    const user = await createTestUser();
    created.push(user.id);
    const client = await signedInClient(user);
    const at = new Date().toISOString();
    const { data, error } = await client
      .from('profiles')
      .update({ full_name: 'Ada Lovelace', feedback_opt_in: true, onboarding_completed_at: at })
      .eq('id', user.id)
      .select('full_name, feedback_opt_in, onboarding_completed_at')
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ full_name: 'Ada Lovelace', feedback_opt_in: true });
    expect(new Date(data!.onboarding_completed_at!).toISOString()).toBe(at);
  });

  it.each([
    ['plan', { plan: 'pro' }],
    ['email', { email: 'attacker@example.com' }],
    ['trial_ends_at', { trial_ends_at: '2099-01-01T00:00:00Z' }],
  ])('the owner cannot update %s (column grant)', async (_col, patch) => {
    const user = await createTestUser();
    created.push(user.id);
    const client = await signedInClient(user);
    const { error } = await client.from('profiles').update(patch as never).eq('id', user.id);
    expect(denied(error)).toBe(true);
    const [p] = await sql<{ plan: string; email: string }>('select plan, email from public.profiles where id = $1', [user.id]);
    expect(p).toMatchObject({ plan: 'trial', email: user.email });
  });
});
