'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { signUpWithEmail, type AuthResult } from '@/lib/auth/client-auth';
import { SignupSchema, type SignupInput } from '@/lib/validation/auth';
import { AuthBanner } from './AuthBanner';
import { PasswordChecklist } from './PasswordChecklist';
import { PasswordInput } from './PasswordInput';

export const PENDING_EMAIL_KEY = 'ciq:pending-email';

export function SignupForm() {
  const router = useRouter();
  const [result, setResult] = useState<AuthResult | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  const password = watch('password');

  useEffect(() => {
    if (result && !result.ok) bannerRef.current?.focus();
  }, [result]);

  async function onSubmit(values: SignupInput) {
    setResult(null);
    const r = await signUpWithEmail(values);
    if (!r.ok) {
      setResult(r);
      return;
    }
    try {
      sessionStorage.setItem(PENDING_EMAIL_KEY, values.email);
    } catch {
      // sessionStorage blocked (private mode): /verify-email falls back to generic copy.
    }
    router.push('/verify-email');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-h5 text-fg-primary">Create your account</h1>
        <p className="text-body-sm text-fg-secondary">Review NDAs and MSAs in minutes — free for 14 days.</p>
      </div>

      {result && !result.ok && (
        <AuthBanner ref={bannerRef} tone="danger">
          {result.kind === 'email_exists' ? (
            <>
              An account with this email already exists —{' '}
              <Link href="/login" className="font-medium underline underline-offset-2">
                sign in instead
              </Link>
            </>
          ) : (
            result.message
          )}
        </AuthBanner>
      )}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Email" name="email" error={errors.email?.message}>
          {(f) => <Input type="email" autoComplete="email" autoFocus {...f} {...register('email')} />}
        </FormField>
        <FormField
          label="Password"
          name="password"
          hint="At least 8 characters, with a letter and a number"
          error={errors.password?.message}
        >
          {(f) => <PasswordInput autoComplete="new-password" {...f} {...register('password')} />}
        </FormField>
        <PasswordChecklist password={password} />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>
        <p className="text-body-sm text-fg-secondary">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-fg-link underline underline-offset-2">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-fg-link underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="text-body-sm text-fg-secondary">
        Already have an account?{' '}
        <Link href="/login" className="text-fg-link underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
