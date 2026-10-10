import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent';

// docs/design.md "Semantic Status Badge": [Color] 50 bg, [Color] 200 border, 700 text, 4px radius, 2px 8px.
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-subtle border-border text-fg-secondary',
  brand: 'bg-info-bg border-info-border text-info-fg',
  success: 'bg-success-bg border-success-border text-success-fg',
  warning: 'bg-warning-bg border-warning-border text-warning-fg',
  danger: 'bg-danger-bg border-danger-border text-danger-fg',
  accent: 'bg-accent-bg border-accent-border text-accent-fg',
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; icon?: LucideIcon };

export function Badge({ tone = 'neutral', icon: Icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-sm border px-2 py-0.5 text-body-sm font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}
