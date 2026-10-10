'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const KEY = 'ciq:mobile-banner-dismissed';

/**
 * Under 768 px on the upload and results pages (14 §2.3, §7.4). Client-only: useMediaQuery is null
 * until mounted, so nothing renders during SSR. Dismissal persists across reloads.
 */
export function MobileDeviceBanner() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [dismissed, setDismissed] = useState(true); // hidden until the stored state is known
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!isMobile || dismissed) return null;
  return (
    <Banner
      tone="info"
      dismissLabel="Dismiss desktop browser tip"
      onDismiss={() => {
        setDismissed(true);
        try {
          localStorage.setItem(KEY, '1');
        } catch {
          // storage blocked: dismissal lasts until reload
        }
      }}
    >
      For the best experience with large PDFs, use a desktop browser (Chrome or Firefox).
    </Banner>
  );
}
