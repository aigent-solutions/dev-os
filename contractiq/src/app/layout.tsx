import type { Metadata } from 'next';
import { Announcer } from '@/components/layout/Announcer';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider, Toaster } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { interDisplay } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ContractIQ', template: '%s · ContractIQ' },
  description: 'AI-assisted NDA and MSA review for teams without in-house counsel.',
};

// Every layout's <main> carries id="main" for the skip link (00-foundation.md §6.11).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interDisplay.variable}>
      <body className="bg-surface-page font-sans text-body-lg text-fg-primary antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-fg-primary focus:ring-2 focus:ring-focus"
        >
          Skip to main content
        </a>
        <QueryProvider>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>
              {children}
              <Toaster />
              <Announcer />
            </ToastProvider>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
