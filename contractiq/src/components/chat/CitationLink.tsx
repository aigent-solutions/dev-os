'use client';

import { useResultsViewerStore } from '@/stores/useResultsViewerStore';

/** "Page X" chip → the viewer scrolls there (below 1024 px the layout switches to the Document tab). */
export function CitationLink({ page }: { page: number }) {
  const goToPage = useResultsViewerStore((s) => s.goToPage);
  return (
    <button
      type="button"
      onClick={() => goToPage(page)}
      aria-label={`Go to page ${page} in the document`}
      className="inline-flex items-center rounded-sm border border-info-border bg-info-bg px-2 py-0.5 align-baseline text-body-sm font-medium text-info-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      Page {page}
    </button>
  );
}
