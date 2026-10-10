'use client';

import { ErrorView } from '@/components/errors/ErrorView';
import { interDisplay } from './fonts';
import './globals.css';

// Replaces the root layout when it fails, so it renders its own <html> and <body>.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={interDisplay.variable}>
      <body className="bg-surface-page font-sans text-body-lg text-fg-primary antialiased">
        <ErrorView {...props} />
      </body>
    </html>
  );
}
