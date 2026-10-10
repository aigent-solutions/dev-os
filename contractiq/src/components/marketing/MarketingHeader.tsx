import Link from 'next/link';
import { Wordmark } from '@/components/layout/Wordmark';
import { Button } from '@/components/ui/Button';

/** Wordmark + Sign In / Get Started Free (02 §8.1). Both CTAs stay visible on mobile, compact below 768 px. */
export function MarketingHeader() {
  return (
    <header className="bg-surface-page">
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8 xl:px-28">
        <Wordmark href="/" />
        <nav aria-label="Main" className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="md:h-10 md:px-4">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button size="sm" asChild className="md:h-10 md:px-4">
            <Link href="/signup">Get Started Free</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
