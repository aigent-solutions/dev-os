import type { ReactNode } from 'react';
import { Footer } from '@/components/marketing/Footer';
import { MaintenanceBanner } from './MaintenanceBanner';
import { RouteFocusMain } from './RouteFocusMain';
import { TopNav } from './TopNav';

/** Signed-in page frame: top nav, maintenance banner, main landmark, footer with the GPT-4o attribution (00 §8.2, 02 §8.7). */
export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <TopNav email={email} />
      <MaintenanceBanner />
      <RouteFocusMain>{children}</RouteFocusMain>
      <Footer />
    </div>
  );
}
