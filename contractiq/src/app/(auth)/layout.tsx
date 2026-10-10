import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Wordmark } from '@/components/layout/Wordmark';

// Centred auth column (01-auth.md §8.1, §9): 400 px card on the page background.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center gap-6 bg-surface-page px-4 py-16 md:py-24">
      <div className="flex w-full max-w-auth flex-col gap-6">
        <Wordmark href="/" />
        <Card as="section" padding="lg">
          {children}
        </Card>
        <Link href="/" className="w-fit text-body-sm text-fg-link underline-offset-2 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
