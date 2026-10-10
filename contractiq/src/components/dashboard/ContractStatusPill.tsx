import { Loader2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { ContractStatus } from '@/types/domain';

type Pill = { label: string; tone: BadgeTone };

/** Status → label/tone (10 §8 mapping). pending_upload never reaches the dashboard. */
export function statusPill(status: ContractStatus, reviewCompletedAt: string | null): Pill {
  if (status === 'completed') return reviewCompletedAt ? { label: 'Reviewed', tone: 'success' } : { label: 'Ready to review', tone: 'brand' };
  if (status === 'processing') return { label: 'Analysing…', tone: 'neutral' };
  if (status === 'error') return { label: 'Needs retry', tone: 'danger' };
  return { label: 'Not analysed', tone: 'warning' }; // ready
}

/** Semantic Status Badge; the label is always visible (never colour alone). */
export function ContractStatusPill({ status, reviewCompletedAt }: { status: ContractStatus; reviewCompletedAt: string | null }) {
  const { label, tone } = statusPill(status, reviewCompletedAt);
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {status === 'processing' && <Loader2 aria-hidden className="h-3 w-3 shrink-0 motion-safe:animate-spin" />}
      {label}
    </Badge>
  );
}
