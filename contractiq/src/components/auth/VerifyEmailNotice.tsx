'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useCooldown } from '@/hooks/useCooldown';
import { resendVerification } from '@/lib/auth/client-auth';
import { EmailSchema } from '@/lib/validation/auth';
import { AuthBanner } from './AuthBanner';
import { PENDING_EMAIL_KEY } from './SignupForm';

/** "Check your inbox" with a resend button and a 60 s cooldown (01-auth.md §8.4). */
export function VerifyEmailNotice() {
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [typedEmail, setTypedEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const cooldown = useCooldown(60);
  const inputId = useId();

  useEffect(() => {
    try {
      setStoredEmail(sessionStorage.getItem(PENDING_EMAIL_KEY));
    } catch {
      setStoredEmail(null); // storage blocked: generic copy + email input
    }
  }, []);

  async function onResend() {
    const parsed = EmailSchema.safeParse(storedEmail ?? typedEmail);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setState('sending');
    const r = await resendVerification(parsed.data);
    if (r.ok) {
      setState('sent');
      cooldown.start();
    } else {
      setState('error');
      setErrorMessage(r.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Mail aria-hidden className="h-6 w-6 text-fg-secondary" />
        <h1 className="text-h5 text-fg-primary">Check your inbox</h1>
        <p className="text-body-lg font-normal text-fg-primary">
          {storedEmail ? (
            <>
              We sent a verification link to <strong className="font-medium">{storedEmail}</strong>. Click it to
              activate your account.
            </>
          ) : (
            'We sent a verification link to your email address.'
          )}
        </p>
        <p className="text-body-sm text-fg-secondary">Didn&apos;t get it? Check your spam folder, or resend the email.</p>
      </div>

      {state === 'sent' && <AuthBanner tone="success">Verification email sent.</AuthBanner>}
      {state === 'error' && <AuthBanner tone="danger">{errorMessage}</AuthBanner>}

      <div className="flex flex-col gap-4">
        {!storedEmail && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId}>Email</Label>
            <Input
              id={inputId}
              type="email"
              autoComplete="email"
              value={typedEmail}
              invalid={!!fieldError}
              aria-describedby={fieldError ? `${inputId}-error` : undefined}
              onChange={(e) => setTypedEmail(e.target.value)}
            />
            <FieldError id={`${inputId}-error`} message={fieldError} />
          </div>
        )}
        <Button
          variant="secondary"
          onClick={onResend}
          loading={state === 'sending'}
          disabled={cooldown.active}
          className="w-full"
        >
          {cooldown.active ? `Resend in ${cooldown.remaining}s` : 'Resend email'}
        </Button>
      </div>

      <Link href="/login" className="w-fit text-body-sm text-fg-link underline-offset-2 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
