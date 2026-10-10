'use client';

import { useCallback } from 'react';

export type Politeness = 'polite' | 'assertive';
export type AnnounceDetail = { message: string; politeness: Politeness };

/** Window event the root-layout <Announcer /> listens for (14 §7.3). */
export const ANNOUNCE_EVENT = 'ciq:announce';

/** Returns a function that speaks a message through the single app-wide live region. */
export function useAnnouncer(): (message: string, politeness?: Politeness) => void {
  return useCallback((message: string, politeness: Politeness = 'polite') => {
    window.dispatchEvent(new CustomEvent<AnnounceDetail>(ANNOUNCE_EVENT, { detail: { message, politeness } }));
  }, []);
}
