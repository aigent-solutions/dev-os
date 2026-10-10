'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { confidenceBand, type ConfidenceBand } from '@/types/domain';

// 00 §9.4 / 06 §8.11: colour + icon + visible % text — colour is never the only signal.
const BANDS: Record<ConfidenceBand, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  high: { tone: 'success', icon: CheckCircle2, label: 'High' },
  medium: { tone: 'warning', icon: AlertCircle, label: 'Medium' },
  low: { tone: 'danger', icon: AlertTriangle, label: 'Low' },
};

export type ConfidenceBadgeProps = { score: number; size?: 'sm' | 'md'; className?: string; 'data-onboarding'?: string };

export function ConfidenceBadge({ score, size = 'md', className, ...rest }: ConfidenceBadgeProps) {
  const { tone, icon, label } = BANDS[confidenceBand(score)];
  return (
    <Tooltip content="How sure the AI is about this value. Lower scores need checking.">
      <button
        type="button"
        data-no-row-select
        aria-label={`Confidence ${score}%, ${label}`}
        className={cn('shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', className)}
        {...rest}
      >
        <Badge tone={tone} icon={icon} className={size === 'sm' ? 'px-1' : undefined}>
          {score}%
        </Badge>
      </button>
    </Tooltip>
  );
}
