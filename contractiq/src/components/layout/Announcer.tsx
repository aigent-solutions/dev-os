'use client';

import { useEffect, useState } from 'react';
import { ANNOUNCE_EVENT, type AnnounceDetail } from '@/hooks/useAnnouncer';

const CLEAR_AFTER_MS = 1000;

/**
 * The app's single visually hidden live region (14 §7.3), rendered once in the root layout.
 * Messages clear after 1 s so the same text is announced again if repeated.
 */
export function Announcer() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAnnounce = (e: Event) => {
      const { message, politeness } = (e as CustomEvent<AnnounceDetail>).detail;
      const set = politeness === 'assertive' ? setAssertive : setPolite;
      set(message);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setPolite('');
        setAssertive('');
      }, CLEAR_AFTER_MS);
    };
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="sr-only">
      <div aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </div>
  );
}
