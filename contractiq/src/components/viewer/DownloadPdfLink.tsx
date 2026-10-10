import { Download } from 'lucide-react';

/** Always the latest signed URL from useContract (07 §8.7). Hidden when there is none. */
export function DownloadPdfLink({ pdfUrl, fileName }: { pdfUrl: string | null; fileName: string }) {
  if (!pdfUrl) return null;
  return (
    <a
      href={pdfUrl}
      download={fileName}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-body-sm font-medium text-fg-link transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Download aria-hidden className="h-4 w-4" />
      Download PDF
    </a>
  );
}
