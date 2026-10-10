import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const tones: Record<BannerTone, { classes: string; icon: LucideIcon }> = {
  info: { classes: 'bg-info-bg border-info-border text-info-fg', icon: Info },
  warning: { classes: 'bg-warning-bg border-warning-border text-warning-fg', icon: AlertTriangle },
  danger: { classes: 'bg-danger-bg border-danger-border text-danger-fg', icon: AlertCircle },
  success: { classes: 'bg-success-bg border-success-border text-success-fg', icon: CheckCircle2 },
};

export type BannerProps = {
  tone: BannerTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  /** Omit for a banner that cannot be dismissed (e.g. the legal disclaimer). */
  onDismiss?: () => void;
  /** Accessible name of the close button. Make it specific when several banners can show at once. */
  dismissLabel?: string;
  className?: string;
};

export function Banner({ tone, title, children, action, onDismiss, dismissLabel = 'Dismiss', className }: BannerProps) {
  const { classes, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex w-full items-start gap-2 rounded-md border p-3 text-body-sm', classes, className)}
    >
      <Icon aria-hidden className="mt-px h-4 w-4 shrink-0" />
      <div className="flex flex-1 flex-col gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
