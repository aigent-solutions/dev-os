'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import { scrollWithin } from './highlight';

export type NavigationRequest = { page: number; text: string | null; pageOnly: boolean };

/**
 * Shared by PdfViewer and TextViewer (07 §6.4). Reacts to each goToPage (scrollRequestId), clamps the page,
 * makes sure it's rendered, scrolls the viewer container only, then hands over to `highlight`.
 * Requests that arrive while the viewer is hidden (width 0, e.g. the mobile Document tab) are held and
 * replayed once it becomes visible. Focus is never moved.
 */
export function useViewerNavigation(p: {
  containerRef: RefObject<HTMLElement>;
  numPages: number;
  /** false while the container has no width or the document isn't loaded yet. */
  ready: boolean;
  getPageEl: (page: number) => HTMLElement | null | undefined;
  ensureRendered?: (page: number) => void;
  highlight: (req: NavigationRequest) => void;
  announce: (message: string) => void;
}) {
  const scrollRequestId = useResultsViewerStore((s) => s.scrollRequestId);
  const handled = useRef(0);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    const { containerRef, numPages, ready, getPageEl, ensureRendered, highlight, announce } = latest.current;
    if (scrollRequestId === handled.current || !ready || numPages < 1) return;
    const { targetPage, highlightText } = useResultsViewerStore.getState();
    if (!targetPage || targetPage < 1) {
      handled.current = scrollRequestId;
      return;
    }
    handled.current = scrollRequestId;
    const beyond = targetPage > numPages;
    const page = Math.min(Math.max(targetPage, 1), numPages);
    ensureRendered?.(page);
    // Let a newly-widened render window paint before measuring.
    requestAnimationFrame(() => {
      const container = containerRef.current;
      const el = getPageEl(page);
      if (container && el) scrollWithin(container, el, 'start');
      highlight({ page, text: beyond ? null : highlightText, pageOnly: beyond || !highlightText });
      announce(`Showing page ${page}`);
    });
  }, [scrollRequestId, p.ready, p.numPages]);
}
