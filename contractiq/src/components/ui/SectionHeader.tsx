import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
};

/** Section titles are always H5 (24/32 medium). The parent puts gap-6 before the content. */
export function SectionHeader({ title, description, actions, as: Heading = 'h2', className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <Heading className="text-h5 text-fg-primary">{title}</Heading>
        {description && <p className="text-body-sm text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
