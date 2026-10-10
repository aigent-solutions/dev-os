import type { ReactNode } from 'react';
import { Footer } from '@/components/marketing/Footer';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';

// Public pages: header, main landmark (skip-link target), footer (02 §6).
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <MarketingHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
