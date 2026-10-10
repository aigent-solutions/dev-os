import type { Metadata } from 'next';
import { VerifyEmailNotice } from '@/components/auth/VerifyEmailNotice';

export const metadata: Metadata = { title: 'Verify your email' };

export default function VerifyEmailPage() {
  return <VerifyEmailNotice />;
}
