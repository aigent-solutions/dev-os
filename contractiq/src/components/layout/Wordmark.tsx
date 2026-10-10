import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Text wordmark (no logo asset is defined in docs/design.md). */
export function Wordmark({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'w-fit rounded-sm text-h5 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        className,
      )}
    >
      ContractIQ
    </Link>
  );
}
