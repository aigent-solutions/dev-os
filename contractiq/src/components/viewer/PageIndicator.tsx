'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

/** "Page {current} of {total}" with previous/next, and the live region for navigation (07 §8.4). */
export function PageIndicator({ current, total, announcement, onPrev, onNext }: {
  current: number;
  total: number;
  announcement: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous page" icon={ChevronUp} size="sm" onClick={onPrev} disabled={current <= 1} />
      <IconButton label="Next page" icon={ChevronDown} size="sm" onClick={onNext} disabled={current >= total} />
      <span className="whitespace-nowrap text-body-sm text-fg-secondary">
        Page {current} of {total}
      </span>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
