import { FileText } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/** New user / only abandoned uploads (10 §8). The PRD sentence is the card's accessible description. */
export function EmptyState() {
  return (
    <Card
      as="section"
      padding="lg"
      aria-labelledby="empty-title"
      aria-describedby="empty-description"
      className="flex flex-col items-center gap-6 py-16 text-center"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle">
        <FileText aria-hidden className="h-6 w-6 text-fg-secondary" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 id="empty-title" className="text-h5 text-fg-primary">
          No contracts reviewed yet
        </h2>
        <p className="text-body-lg font-normal text-fg-secondary">Upload your first contract to begin.</p>
        <p id="empty-description" hidden>
          No contracts reviewed yet — upload your first contract to begin
        </p>
      </div>
      <Button asChild>
        <Link href="/contracts/new">
          Review a Contract
        </Link>
      </Button>
    </Card>
  );
}
