'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { Button } from '@/components/ui/Button';
import { qk } from '@/lib/query-keys';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import type { ContractDetail } from '@/types/api';
import { applyPdfHighlight, clearHighlights, scrollWithin } from './highlight';
import { useViewerNavigation, type NavigationRequest } from './useViewerNavigation';
import { ViewerSkeleton } from './ViewerSkeleton';
import { ZOOM_STEP } from './ZoomControls';
import './viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; // copied from pdfjs-dist by scripts/copy-pdf-worker.mjs

const LETTER_ASPECT = 1.294;
const MAX_BASE_WIDTH = 816; // US Letter at 96 dpi
const PAGE_GAP = 16;

export type PdfViewerProps = {
  contractId: string;
  pdfUrl: string;
  pdfUrlExpiresAt: string | null;
  expectedPages: number;
  onFatalError: () => void;
  onCurrentPageChange: (page: number, total: number) => void;
  announce: (message: string) => void;
};

/**
 * react-pdf viewer with lazy page rendering (visible ± 2, ± 1 on mobile), text layer for highlights,
 * zoom, and one refresh-and-retry when a load fails on an expired signed URL (07 §6.3–§6.6, §8.3).
 * The document is fetched once from the FIRST url; later url changes don't reload it.
 */
export default function PdfViewer({ contractId, pdfUrl, pdfUrlExpiresAt, expectedPages, onFatalError, onCurrentPageChange, announce }: PdfViewerProps) {
  const qc = useQueryClient();
  const zoom = useResultsViewerStore((s) => s.zoom);
  const setZoom = useResultsViewerStore((s) => s.setZoom);
  const setViewerMode = useResultsViewerStore((s) => s.setViewerMode);

  const [loadedUrl, setLoadedUrl] = useState(pdfUrl); // first URL only (07 §6.6)
  const [retryCount, setRetryCount] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [aspects, setAspects] = useState<Map<number, number>>(new Map());
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState<number[]>([1]);
  const [forcedPage, setForcedPage] = useState<number | null>(null);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const currentPage = useRef(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<number, HTMLDivElement>());
  const pending = useRef<NavigationRequest | null>(null);
  const lastSpanHighlight = useRef<NavigationRequest | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const options = useMemo(() => ({ disableRange: true, disableStream: true, isEvalSupported: false }), []);

  // Width (0 while hidden, e.g. the inactive mobile tab → render nothing).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseWidth = Math.max(0, Math.min(width - 32, MAX_BASE_WIDTH));
  const pageWidth = Math.round(baseWidth * zoom);
  const defaultAspect = aspects.get(1) ?? LETTER_ASPECT;

  // Visible pages and the current page (largest visible share; ties → lower page).
  useEffect(() => {
    const root = containerRef.current;
    if (!root || numPages === 0) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        const shown = [...ratios].filter(([, r]) => r > 0).map(([p]) => p).sort((a, b) => a - b);
        if (shown.length) setVisible(shown);
        let best = currentPage.current;
        let bestRatio = -1;
        for (const [page, ratio] of ratios) if (ratio > bestRatio || (ratio === bestRatio && page < best)) [best, bestRatio] = [page, ratio];
        currentPage.current = best;
        onCurrentPageChange(best, numPages);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    slotRefs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages, onCurrentPageChange]);

  // Render window = visible ± R (+ a page navigation is about to scroll to).
  const radius = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 2;
  const lo = Math.max(1, Math.min(...visible) - radius);
  const hi = Math.min(numPages, Math.max(...visible) + radius);
  const shouldRender = (n: number) => width > 0 && ((n >= lo && n <= hi) || n === forcedPage);

  const runHighlight = useCallback((req: NavigationRequest, scroll: boolean) => {
    const root = containerRef.current;
    const pageEl = slotRefs.current.get(req.page);
    if (!root || !pageEl) return;
    clearTimeout(flashTimer.current);
    const result = applyPdfHighlight(root, pageEl, req.pageOnly ? null : req.text);
    lastSpanHighlight.current = result.kind === 'spans' ? req : null;
    if (result.kind === 'spans' && result.firstSpan && scroll) scrollWithin(root, result.firstSpan, 'center');
    // Page-only highlight from a navigation without text (chat citation) fades after 1.5 s.
    if (req.pageOnly) flashTimer.current = setTimeout(() => clearHighlights(root), 1500);
  }, []);

  const highlight = useCallback(
    (req: NavigationRequest) => {
      pending.current = null;
      // A page's text layer exists only while it's rendered, so check the DOM rather than remembering.
      const layerReady = !!slotRefs.current.get(req.page)?.querySelector('.react-pdf__Page__textContent span');
      if (req.pageOnly || layerReady) runHighlight(req, true);
      else pending.current = req; // applied when that page's text layer renders
    },
    [runHighlight],
  );

  const onTextLayerReady = (n: number) => {
    if (pending.current?.page === n) {
      const req = pending.current;
      pending.current = null;
      runHighlight(req, true);
    } else if (lastSpanHighlight.current?.page === n) {
      runHighlight(lastSpanHighlight.current, false); // text layer re-rendered (zoom): re-apply
    }
  };

  useViewerNavigation({
    containerRef,
    numPages,
    ready: width > 0 && numPages > 0,
    getPageEl: (page) => slotRefs.current.get(page),
    ensureRendered: setForcedPage,
    highlight,
    announce,
  });

  // Keep the current page in view when the zoom changes.
  const prevWidth = useRef(pageWidth);
  useLayoutEffect(() => {
    if (prevWidth.current === pageWidth) return;
    prevWidth.current = pageWidth;
    const root = containerRef.current;
    const el = slotRefs.current.get(currentPage.current);
    if (root && el) root.scrollTop = el.offsetTop - PAGE_GAP;
  }, [pageWidth]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '=') setZoom(zoom + ZOOM_STEP);
    else if (e.key === '-') setZoom(zoom - ZOOM_STEP);
    else if (e.key === '0') setZoom(1);
    else return;
    e.preventDefault(); // only inside the viewer
  };

  const handleError = useCallback(async () => {
    const expired = pdfUrlExpiresAt ? Date.parse(pdfUrlExpiresAt) <= Date.now() : false;
    if (expired && retryCount === 0) {
      await qc.refetchQueries({ queryKey: qk.contract(contractId) });
      const fresh = qc.getQueryData<ContractDetail>(qk.contract(contractId))?.pdf_url;
      if (fresh) {
        setLoadedUrl(fresh);
        setRetryCount(1);
        return;
      }
    }
    onFatalError();
  }, [pdfUrlExpiresAt, retryCount, qc, contractId, onFatalError]);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scroll region is focusable for keyboard scrolling and zoom shortcuts
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="PDF document"
      onKeyDown={onKeyDown}
      className="h-full overflow-auto bg-surface-page focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <Document
        key={retryCount}
        file={loadedUrl}
        options={options}
        loading={<ViewerSkeleton />}
        error={null}
        onLoadSuccess={({ numPages: n }) => {
          if (n !== expectedPages) console.warn('[viewer] page count mismatch', { expected: expectedPages, actual: n });
          setNumPages(n);
          onCurrentPageChange(1, n);
        }}
        onLoadError={handleError}
        onSourceError={handleError}
        className="flex flex-col items-center gap-4 p-4"
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
          const height = Math.round(pageWidth * (aspects.get(n) ?? defaultAspect));
          return (
            <div
              key={n}
              data-page={n}
              id={`pdf-page-${n}`}
              tabIndex={-1}
              role="group"
              aria-label={`Page ${n} of ${numPages}`}
              ref={(el) => {
                if (el) slotRefs.current.set(n, el);
                else slotRefs.current.delete(n);
              }}
              className="shrink-0 border border-border bg-surface focus:outline-none"
              style={{ width: pageWidth || undefined, minHeight: height || undefined }}
            >
              {failedPages.has(n) ? (
                <div className="flex flex-col items-center justify-center gap-2 p-6 text-center" style={{ minHeight: height }}>
                  <p className="text-body-sm text-fg-secondary">This page couldn&apos;t be displayed.</p>
                  <Button variant="secondary" size="sm" onClick={() => setViewerMode('text')}>
                    View as text
                  </Button>
                </div>
              ) : shouldRender(n) ? (
                <Page
                  pageNumber={n}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer={false}
                  loading={<div style={{ height }} />}
                  onLoadSuccess={(p) => {
                    const a = p.originalHeight / p.originalWidth;
                    setAspects((m) => (m.get(n) === a ? m : new Map(m).set(n, a)));
                  }}
                  onRenderTextLayerSuccess={() => onTextLayerReady(n)}
                  onRenderError={() => setFailedPages((s) => new Set(s).add(n))}
                />
              ) : null}
            </div>
          );
        })}
      </Document>
    </div>
  );
}
