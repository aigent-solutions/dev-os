'use client';

import { useCallback, useEffect, useState } from 'react';

/** A countdown in whole seconds, e.g. the 60 s resend-email cooldown (01-auth.md §7). */
export function useCooldown(seconds: number): { remaining: number; active: boolean; start: () => void } {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);
  return { remaining, active: remaining > 0, start };
}
