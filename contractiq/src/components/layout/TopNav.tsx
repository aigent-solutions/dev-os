import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

/** Signed-in top bar (00-foundation.md §8.2). "Review a Contract" hides under 768 px (the dashboard CTA covers it). */
export function TopNav({ email }: { email: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-screen-xl items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark href="/dashboard" />
        <div className="flex items-center gap-2">
          <Link href="/contracts/new" className={buttonClasses('primary', 'sm', 'hidden md:inline-flex')}>
            Review a Contract
          </Link>
          <UserMenu email={email} />
        </div>
      </nav>
    </header>
  );
}
