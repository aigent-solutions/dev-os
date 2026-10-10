'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { buttonClasses, Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type ErrorViewProps = { error: Error & { digest?: string }; reset: () => void };

/** Shared body for error.tsx and global-error.tsx (00-foundation.md §6.11). */
export function ErrorView({ error, reset }: ErrorViewProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error.digest ?? 'render_error');
    heading.current?.focus();
  }, [error]);

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-6">
      <Card as="section" padding="lg" className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className="text-h5 text-fg-primary focus:outline-none">
            Something went wrong
          </h1>
          <p className="text-body-lg font-normal text-fg-secondary">An unexpected error occurred. Please try again.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/dashboard" className={buttonClasses('secondary')}>
            Go to dashboard
          </Link>
        </div>
      </Card>
    </main>
  );
}
