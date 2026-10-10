'use client';

/** "Page {n}" navigation button, or "No page" text (06 §8.10 row 3). */
export function PageLink({ page, onGo }: { page: number | null; onGo: () => void }) {
  if (page === null) return <span className="text-body-sm text-fg-secondary">No page</span>;
  return (
    <button
      type="button"
      onClick={onGo}
      aria-label={`Go to page ${page}`}
      className="rounded-sm text-body-sm font-medium text-fg-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      Page {page}
    </button>
  );
}
