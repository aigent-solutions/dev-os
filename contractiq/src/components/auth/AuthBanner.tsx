'use client';

import { forwardRef, type ReactNode } from 'react';
import { Banner, type BannerTone } from '@/components/ui/Banner';

/** A Banner that can receive focus, so screen readers land on auth errors (01-auth.md §8.2). */
export const AuthBanner = forwardRef<HTMLDivElement, { tone: BannerTone; children: ReactNode; action?: ReactNode }>(
  function AuthBanner({ tone, children, action }, ref) {
    return (
      <div ref={ref} tabIndex={-1} className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <Banner tone={tone} action={action}>
          {children}
        </Banner>
      </div>
    );
  },
);
