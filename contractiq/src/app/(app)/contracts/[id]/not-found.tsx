import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function ContractNotFound() {
  return (
    <div className="flex w-full justify-center px-4 py-12">
      <Card as="section" padding="lg" className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-h5 text-fg-primary">We couldn&apos;t find that contract.</h1>
        <Link href="/dashboard" className={buttonClasses('primary', 'md', 'w-fit')}>
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
