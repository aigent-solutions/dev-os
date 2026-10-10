import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// 14-onboarding-a11y.md §13.
const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

/** A controllable matchMedia for the reduced-motion query. */
function controllable(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('reduce') ? matches : false;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    listeners.forEach((l) => l());
  };
}

describe('usePrefersReducedMotion', () => {
  it('reflects matchMedia', () => {
    controllable(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
  });

  it('updates on the change event', () => {
    const set = controllable(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => set(true));
    expect(result.current).toBe(true);
  });

  it('is false during server rendering', () => {
    controllable(true);
    const Probe = () => createElement('span', null, String(usePrefersReducedMotion()));
    expect(renderToString(createElement(Probe))).toContain('false');
  });
});
