'use client';

import { useRef, type ReactNode } from 'react';
import { useRouteFocus } from '@/hooks/useRouteFocus';

/** The signed-in <main> landmark; moves focus to the page h1 after route changes (14 §7.3). */
export function RouteFocusMain({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useRouteFocus(ref);
  return (
    <main ref={ref} id="main" className="flex flex-1 flex-col">
      {children}
    </main>
  );
}
