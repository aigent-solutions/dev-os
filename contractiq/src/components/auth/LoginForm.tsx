'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useCooldown } from '@/hooks/useCooldown';
import { resendVerification, signInWithEmail, type AuthResult } from '@/lib/auth/client-auth';
import { safeNext } from '@/lib/auth/safe-next';
import { EmailSchema, LoginSchema, type LoginInput } from '@/lib/validation/auth';
import { AuthBanner } from './AuthBanner';
import { PasswordInput } from './PasswordInput';

export type LoginFormProps = { next?: string; initialError?: 'verification_failed' };

export function LoginForm({ next, initialError }: LoginFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<AuthResult | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const cooldown = useCooldown(60);
  const bannerRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema), mode: 'onSubmit', reValidateMode: 'onChange' });

  // Move focus to a new error so it is announced and visible.
  useEffect(() => {
    if (result && !result.ok) bannerRef.current?.focus();
  }, [result]);

  async function onSubmit(values: LoginInput) {
    setResult(null);
    setResendState('idle');
    const r = await signInWithEmail(values);
    if (r.ok) {
      router.replace(safeNext(next));
      router.refresh();
      return;
    }
    setResult(r);
  }

  async function onResend() {
    const email = EmailSchema.safeParse(getValues('email'));
    if (!email.success) return;
    setResendState('sending');
    const r = await resendVerification(email.data);
    setResendState(r.ok ? 'sent' : 'error');
    if (r.ok) cooldown.start();
  }

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-h5 text-fg-primary">Sign in to ContractIQ</h1>
      </div>

      {initialError === 'verification_failed' && !result && (
        <AuthBanner tone="warning">That verification link is invalid or has expired. Sign in to get a new one.</AuthBanner>
      )}

      {result && !result.ok && result.kind === 'email_not_confirmed' && (
        <AuthBanner
          ref={bannerRef}
          tone="warning"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={onResend}
              loading={resendState === 'sending'}
              disabled={cooldown.active}
            >
              {cooldown.active ? `Resend in ${cooldown.remaining}s` : 'Resend verification email'}
            </Button>
          }
        >
          {result.message}
        </AuthBanner>
      )}
      {resendState === 'sent' && <AuthBanner tone="success">Verification email sent.</AuthBanner>}
      {resendState === 'error' && <AuthBanner tone="danger">We couldn&apos;t send the email. Please try again.</AuthBanner>}

      {result && !result.ok && result.kind !== 'email_not_confirmed' && (
        <AuthBanner ref={bannerRef} tone="danger">
          {result.message}
        </AuthBanner>
      )}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Email" name="email" error={errors.email?.message}>
          {(f) => <Input type="email" autoComplete="email" autoFocus {...f} {...register('email')} />}
        </FormField>
        <FormField label="Password" name="password" error={errors.password?.message}>
          {(f) => <PasswordInput autoComplete="current-password" {...f} {...register('password')} />}
        </FormField>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="text-body-sm text-fg-secondary">
        New to ContractIQ?{' '}
        <Link href={signupHref} className="text-fg-link underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </div>
  );
}
