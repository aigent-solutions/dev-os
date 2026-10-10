import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article';
  padding?: 'md' | 'lg';
};

/** White surface, 8 px radius, Grey 100 border, no shadow (flat depth). */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Comp = 'div', padding = 'md', className, ...props },
  ref,
) {
  return (
    <Comp
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polymorphic ref
      ref={ref as any}
      className={cn('rounded-lg border border-border bg-surface', padding === 'lg' ? 'p-6' : 'p-4', className)}
      {...props}
    />
  );
});
