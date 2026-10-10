import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageContainerProps = { children: ReactNode; width?: 'default' | 'full'; className?: string };

/**
 * Page wrapper (00-foundation.md §9.6): section gap 40 px. Page padding is responsive;
 * the design.md 112/96 padding applies from 1280 px.
 */
export function PageContainer({ children, width = 'default', className }: PageContainerProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-10 px-4 py-6 md:px-8 md:py-12 xl:px-28 xl:py-24',
        width === 'default' && 'mx-auto max-w-screen-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
