import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom has no matchMedia. Default: wide desktop, no reduced motion. Tests that need a different viewport
// or motion preference override window.matchMedia themselves.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no ResizeObserver; Radix popper positioning measures with it. A no-op is enough for most tests
// (the viewer tests install one that reports a width).
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Testing Library only auto-cleans when Vitest globals are on (they're off here), so unmount after each test.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
