'use client';

import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useMarkReviewComplete } from '@/hooks/useMarkReviewComplete';

/** "Mark review complete" ↔ "Reviewed" pill + "Undo" (06 §8.4). */
export function MarkReviewCompleteButton({ contractId, reviewedAt }: { contractId: string; reviewedAt: string | null }) {
  const mutation = useMarkReviewComplete(contractId);
  if (reviewedAt) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="success" icon={CheckCircle2}>
          Reviewed
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => mutation.mutate(false)}
          loading={mutation.isPending}
          aria-label="Mark review as not complete"
        >
          Undo
        </Button>
      </div>
    );
  }
  return (
    <Button onClick={() => mutation.mutate(true)} loading={mutation.isPending}>
      Mark review complete
    </Button>
  );
}
