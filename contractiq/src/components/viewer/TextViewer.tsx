'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { splitPages } from '@/lib/pdf/page-markers';
import { findSentenceRange } from '@/lib/text/match';
import { cn } from '@/lib/utils';
import { scrollWithin } from './highlight';
import { useViewerNavigation, type NavigationRequest } from './useViewerNavigation';

type Highlight = { page: number; range: { start: number; end: number } | null; flash: boolean } | null;

/** Paginated `[PAGE N]` text: the fallback when there's no PDF or it fails (07 §8.6). */
export function TextViewer({ contractText, onCurrentPageChange, announce }: {
  contractText: string;
  pageCount: number;
  onCurrentPageChange: (page: number, total: number) => void;
  announce: (message: string) => void;
}) {
  const pages = useMemo(() => {
    const split = splitPages(contractText);
    return split.length ? split : [{ page: 1, text: contractText.trim() }]; // defensive: no markers
  }, [contractText]);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  const markRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [highlight, setHighlight] = useState<Highlight>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Current page = the section with the largest visible share.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        let best = 1;
        let bestRatio = -1;
        for (const [page, ratio] of ratios) if (ratio > bestRatio || (ratio === bestRatio && page < best)) [best, bestRatio] = [page, ratio];
        onCurrentPageChange(best, pages.length);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sectionRefs.current.forEach((el) => io.observe(el));
    onCurrentPageChange(1, pages.length);
    return () => io.disconnect();
  }, [pages, onCurrentPageChange]);

  const applyHighlight = useCallback(
    (req: NavigationRequest) => {
      const pageText = pages.find((p) => p.page === req.page)?.text ?? '';
      const range = req.text ? findSentenceRange(pageText, req.text) : null;
      setHighlight({ page: req.page, range, flash: req.pageOnly });
    },
    [pages],
  );

  useViewerNavigation({
    containerRef,
    numPages: pages.length,
    ready: width > 0,
    getPageEl: (page) => sectionRefs.current.get(page),
    highlight: applyHighlight,
    announce,
  });

  // A matched sentence is centred; a page-only highlight from a chat citation fades after 1.5 s.
  useEffect(() => {
    if (!highlight) return;
    if (highlight.range && markRef.current && containerRef.current) scrollWithin(containerRef.current, markRef.current, 'center');
    if (highlight.flash) {
      const t = setTimeout(() => setHighlight(null), 1500);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  return (
    <div ref={containerRef} tabIndex={-1} className="h-full overflow-auto bg-surface-page p-4 focus:outline-none">
      <div className="mx-auto flex max-w-prose flex-col gap-4">
        {pages.map(({ page, text }) => {
          const hl = highlight?.page === page ? highlight : null;
          const labelId = `text-page-${page}-label`;
          return (
            <section
              key={page}
              id={`text-page-${page}`}
              data-page={page}
              tabIndex={-1}
              aria-labelledby={labelId}
              data-highlighted={hl && !hl.range ? 'page' : undefined}
              ref={(el) => {
                if (el) sectionRefs.current.set(page, el);
                else sectionRefs.current.delete(page);
              }}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6 focus:outline-none"
            >
              <h3 id={labelId} className="text-body-sm font-medium text-fg-secondary">
                Page {page}
              </h3>
              <p className={cn('whitespace-pre-wrap text-body-lg text-fg-primary [overflow-wrap:anywhere]')}>
                {hl?.range ? (
                  <>
                    {text.slice(0, hl.range.start)}
                    <mark ref={markRef} data-ciq-highlight="true">
                      {text.slice(hl.range.start, hl.range.end)}
                    </mark>
                    {text.slice(hl.range.end)}
                  </>
                ) : (
                  text
                )}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
