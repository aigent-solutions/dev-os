import type { LucideIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { buttonClasses, type ButtonProps } from './Button';

export type IconButtonProps = Omit<ButtonProps, 'children' | 'asChild' | 'loading'> & {
  /** Required: becomes the accessible name. */
  label: string;
  icon: LucideIcon;
};

/** Square icon-only button (32 or 40 px). The icon is decorative; `label` names the button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, variant = 'ghost', size = 'md', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={buttonClasses(variant, size, cn(size === 'sm' ? 'w-8 px-0' : 'w-10 px-0', className))}
      {...props}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
});
