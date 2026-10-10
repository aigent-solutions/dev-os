'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// Route error card with "Try again" (06 §6.3). Inside the app shell, so no <main> here.
export default function ContractError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex w-full justify-center px-4 py-12">
      <Card as="section" padding="lg" className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-h5 text-fg-primary">Something went wrong</h1>
        <p className="text-body-lg font-normal text-fg-secondary">We couldn&apos;t load this contract. Please try again.</p>
        <Button className="w-fit" onClick={reset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}
