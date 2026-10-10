import { describe, expect, it } from 'vitest';
import { EmailSchema, LoginSchema, PasswordSchema, SignupSchema } from '@/lib/validation/auth';

// 01-auth.md §12.
const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe('EmailSchema', () => {
  it('trims and lower-cases', () => {
    expect(EmailSchema.parse('  Alice@Example.COM ')).toBe('alice@example.com');
  });
  it('rejects an invalid email with a friendly message', () => {
    expect(firstError(EmailSchema.safeParse('not-an-email'))).toBe('Enter a valid email address');
  });
  it('rejects an empty email', () => {
    expect(firstError(EmailSchema.safeParse('   '))).toBe('Enter your email');
  });
});

describe('PasswordSchema', () => {
  it.each([
    ['short1', 'Use at least 8 characters'],
    ['abcdefgh', 'Include at least one number'],
    ['12345678', 'Include at least one letter'],
    ['a1'.repeat(36) + 'b', 'Use 72 characters or fewer'],
  ])('%s → "%s"', (pw, message) => {
    expect(firstError(PasswordSchema.safeParse(pw))).toBe(message);
  });
  it('accepts Password123', () => {
    expect(PasswordSchema.safeParse('Password123').success).toBe(true);
  });
});

describe('Login vs signup', () => {
  it('login does not apply strength rules (older accounts can still sign in)', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: 'weak' }).success).toBe(true);
    expect(SignupSchema.safeParse({ email: 'a@b.co', password: 'weak' }).success).toBe(false);
  });
  it('login requires a password', () => {
    expect(firstError(LoginSchema.safeParse({ email: 'a@b.co', password: '' }))).toBe('Enter your password');
  });
});
