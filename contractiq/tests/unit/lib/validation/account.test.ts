import { describe, expect, it } from 'vitest';
import { DeleteAccountSchema, UpdateProfileSchema } from '@/lib/validation/account';

// 13-data-lifecycle-gdpr.md §12.
describe('UpdateProfileSchema', () => {
  it.each([[{ plan: 'pro' }], [{ email: 'x@y.z' }], [{ trial_ends_at: '2099-01-01' }], [{ full_name: 'A', plan: 'pro' }]])('strict: rejects %j', (body) => {
    expect(UpdateProfileSchema.safeParse(body).success).toBe(false);
  });
  it('rejects an empty object', () => {
    expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
  });
  it('blank full_name → null', () => {
    expect(UpdateProfileSchema.parse({ full_name: '   ' })).toEqual({ full_name: null });
  });
  it('120 characters ok, 121 rejected', () => {
    expect(UpdateProfileSchema.safeParse({ full_name: 'a'.repeat(120) }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ full_name: 'a'.repeat(121) }).success).toBe(false);
  });
  it('onboarding_completed only accepts the literal true', () => {
    expect(UpdateProfileSchema.safeParse({ onboarding_completed: true }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ onboarding_completed: false }).success).toBe(false);
  });
});

describe('DeleteAccountSchema', () => {
  it('requires the literal DELETE', () => {
    expect(DeleteAccountSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
    for (const confirm of ['delete', 'DELETE ', '', 'yes']) expect(DeleteAccountSchema.safeParse({ confirm }).success).toBe(false);
    expect(DeleteAccountSchema.safeParse({ confirm: 'DELETE', extra: 1 }).success).toBe(false);
  });
});
