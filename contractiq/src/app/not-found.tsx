import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// Unknown URLs, and contracts the user doesn't own (notFound() from the results page).
export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-6">
      <Card as="section" padding="lg" className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-h5 text-fg-primary">We couldn&apos;t find that page</h1>
          <p className="text-body-lg font-normal text-fg-secondary">
            It may have been deleted, or you may not have access to it.
          </p>
        </div>
        <Link href="/dashboard" className={buttonClasses('primary', 'md', 'w-fit')}>
          Back to dashboard
        </Link>
      </Card>
    </main>
  );
}
