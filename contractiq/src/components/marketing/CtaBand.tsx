import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/** Closing call to action on the brand tint (02 §8.6). */
export function CtaBand() {
  return (
    <Card as="section" padding="lg" aria-labelledby="cta-heading" className="flex flex-col items-start gap-4 border-info-border bg-brand-subtle md:flex-row md:items-center md:justify-between">
      <h2 id="cta-heading" className="text-h5 text-fg-primary">
        Review your next contract in under 15 minutes
      </h2>
      <Button asChild className="w-full sm:w-auto">
        <Link href="/signup">Get Started Free</Link>
      </Button>
    </Card>
  );
}
