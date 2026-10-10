'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import { DownloadPdfLink } from './DownloadPdfLink';
import { PageIndicator } from './PageIndicator';
import { TextViewer } from './TextViewer';
import { ViewerNotice } from './ViewerNotice';
import { ViewerSkeleton } from './ViewerSkeleton';
import { ZoomControls } from './ZoomControls';

// PDF.js only runs in the browser (07 §6.1).
const PdfViewer = dynamic(() => import('./PdfViewer'), { ssr: false, loading: () => <ViewerSkeleton /> });

export type DocumentViewerProps = {
  contractId: string;
  fileName: string;
  pageCount: number;
  contractText: string;
  pdfUrl: string | null;
  pdfUrlExpiresAt: string | null;
};

/** Left panel of the results page: PDF or text, with toolbar and navigation (07 §8.2). */
export function DocumentViewer({ contractId, fileName, pageCount, contractText, pdfUrl, pdfUrlExpiresAt }: DocumentViewerProps) {
  const viewerMode = useResultsViewerStore((s) => s.viewerMode);
  const setViewerMode = useResultsViewerStore((s) => s.setViewerMode);
  const zoom = useResultsViewerStore((s) => s.zoom);
  const setZoom = useResultsViewerStore((s) => s.setZoom);
  const goToPage = useResultsViewerStore((s) => s.goToPage);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [current, setCurrent] = useState({ page: 1, total: pageCount });
  const [announcement, setAnnouncement] = useState('');

  const hasPdf = !!pdfUrl;
  useEffect(() => {
    setViewerMode(hasPdf && !pdfFailed ? 'pdf' : 'text');
  }, [hasPdf, pdfFailed, setViewerMode]);

  const onCurrentPageChange = useCallback((page: number, total: number) => setCurrent({ page, total }), []);
  const announce = useCallback((message: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  const onFatalError = useCallback(() => {
    setPdfFailed(true);
    setViewerMode('text');
  }, [setViewerMode]);

  const mode = hasPdf && !pdfFailed ? viewerMode : 'text';

  return (
    <section aria-label="Contract document" className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-2 py-1">
        <PageIndicator
          current={current.page}
          total={current.total}
          announcement={announcement}
          onPrev={() => goToPage(current.page - 1)}
          onNext={() => goToPage(current.page + 1)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'pdf' && <ZoomControls zoom={zoom} onZoom={setZoom} />}
          {mode === 'pdf' && (
            <ToggleButton onClick={() => setViewerMode('text')}>View as text</ToggleButton>
          )}
          {mode === 'text' && hasPdf && !pdfFailed && (
            <ToggleButton onClick={() => setViewerMode('pdf')}>View PDF</ToggleButton>
          )}
          <DownloadPdfLink pdfUrl={pdfUrl} fileName={fileName} />
        </div>
      </div>
      {mode === 'text' && (pdfFailed || !hasPdf) && <ViewerNotice reason={pdfFailed ? 'failed' : 'missing'} />}
      <div className="min-h-0 flex-1">
        {mode === 'pdf' && pdfUrl ? (
          <PdfViewer
            contractId={contractId}
            pdfUrl={pdfUrl}
            pdfUrlExpiresAt={pdfUrlExpiresAt}
            expectedPages={pageCount}
            onFatalError={onFatalError}
            onCurrentPageChange={onCurrentPageChange}
            announce={announce}
          />
        ) : (
          <TextViewer contractText={contractText} pageCount={pageCount} onCurrentPageChange={onCurrentPageChange} announce={announce} />
        )}
      </div>
    </section>
  );
}

function ToggleButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-md px-2 text-body-sm font-medium text-fg-link transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </button>
  );
}
