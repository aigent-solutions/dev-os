'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * After a client-side route change, move focus to the page h1 inside `ref` (WCAG 2.4.3, 14 §3.2 O9).
 * Skipped on the first render (so the skip link stays first on a full page load), when focus is
 * already inside the container, and when an onboarding tip is open (it takes focus itself).
 */
export function useRouteFocus(ref: RefObject<HTMLElement>): void {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const container = ref.current;
      if (!container) return;
      const active = document.activeElement;
      if (active && active !== document.body && container.contains(active)) return;
      if (document.querySelector('[data-onboarding-popover]')) return;
      const h1 = container.querySelector<HTMLElement>('h1');
      if (!h1) return;
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, ref]);
}
