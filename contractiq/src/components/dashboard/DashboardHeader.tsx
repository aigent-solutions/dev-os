import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';

/** Page title and the primary CTA (10 §8). The CTA is an onboarding tooltip anchor (14). */
export function DashboardHeader() {
  return (
    <SectionHeader
      as="h1"
      title="Your contracts"
      actions={
        <Button asChild>
          <Link href="/contracts/new" data-onboarding="review-cta">
            <Plus aria-hidden className="h-4 w-4" />
            Review a Contract
          </Link>
        </Button>
      }
    />
  );
}
