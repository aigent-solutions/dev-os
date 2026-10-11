import '@/lib/server-guard'; // 00-foundation.md §6.12 rule 1
import { appError } from '@/lib/api/errors';
import { MAX_PAGES } from '@/lib/constants';
import { pageMarker } from './page-markers';

// Server-side text extraction with pdfjs-dist (the same version react-pdf uses in the viewer).
// Replaces spec 03's pdf-parse@1.1.1, whose bundled 2018 pdf.js fails intermittently on a
// document parsed after another one in the same process (README §6, "PDF text extraction").
type TextItem = { str: string; transform: number[]; hasEOL?: boolean };

/**
 * Lazy-loaded so modules that only import this file's siblings never pay for pdf.js.
 *
 * In Node, pdf.js runs its worker in-process and would `import('./pdf.worker.mjs')` at runtime. File
 * tracing can't see that import, so the deployed Netlify function shipped without the worker and every
 * extraction failed ("Setting up fake worker failed"). Importing it here by literal path gets it traced,
 * and `globalThis.pdfjsWorker` is pdf.js's documented hook for handing over a worker already loaded.
 * scripts/check-pdf-worker-traced.mjs keeps it in the build.
 */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]);
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= worker;
  return pdfjs;
}

/** One page as `[PAGE N]\n<text>`, keeping line breaks by y-position. Every page gets a marker. */
function renderItems(pageNumber: number, items: TextItem[]): string {
  let lastY: number | undefined;
  let out = '';
  for (const item of items) {
    const y = item.transform[5];
    out += lastY === undefined || y === undefined || Math.abs(y - lastY) < 1 ? item.str : '\n' + item.str;
    lastY = y;
  }
  return `${pageMarker(pageNumber)}\n${out}`;
}

/** Text with [PAGE N] markers, page count and word count (03-upload-extraction.md §6.3). */
export async function extractPdfText(buf: Buffer): Promise<{ text: string; pageCount: number; wordCount: number }> {
  const { getDocument } = await loadPdfjs();
  // pdf.js takes ownership of (and may detach) the data, so give it its own copy.
  const task = getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name ?? '';
    if (name === 'PasswordException' || /password/i.test(String((err as Error)?.message))) throw appError('PDF_ENCRYPTED');
    const unreadable = appError('PDF_UNREADABLE');
    unreadable.cause = err; // logged by the caller as { name, message }; never sent to the client
    throw unreadable;
  }

  try {
    const pageCount = doc.numPages;
    if (pageCount > MAX_PAGES) throw appError('TOO_MANY_PAGES', { page_count: pageCount });
    if (pageCount < 1) throw appError('PDF_UNREADABLE');

    const pages: string[] = [];
    for (let n = 1; n <= pageCount; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(renderItems(n, content.items.filter((i) => 'str' in i) as TextItem[]));
      page.cleanup();
    }
    const text = normaliseExtractedText(pages.join('\n\n'));
    return { text, pageCount, wordCount: countWords(text) };
  } catch (err) {
    if (err instanceof Error && 'code' in err) throw err; // AppError
    const unreadable = appError('PDF_UNREADABLE');
    unreadable.cause = err;
    throw unreadable;
  } finally {
    await doc.destroy();
  }
}

/** Clean-up that keeps the [PAGE N] markers and line structure intact. */
export function normaliseExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, '') // NULs break Postgres text
    .replace(/­/g, '') // soft hyphens
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+\n/g, '\n') // trailing spaces
    .replace(/\n{3,}/g, '\n\n') // collapse blank runs
    .trim();
}

/** Words = whitespace-separated tokens with at least one letter or digit, page markers excluded. */
export function countWords(text: string): number {
  return text
    .replace(/\[PAGE \d+\]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
