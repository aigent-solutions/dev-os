import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

type SearchParams = { next?: string | string[]; error?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const error = first(searchParams.error);
  return (
    <LoginForm
      next={first(searchParams.next)}
      initialError={error === 'verification_failed' ? 'verification_failed' : undefined}
    />
  );
}
