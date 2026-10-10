# 07 — Document Viewer (PDF.js + Text Fallback)

## 1. Overview

**Builds:** the left panel of the results page.
- `DocumentViewer` chooses between `PdfViewer` (react-pdf / PDF.js, lazy page rendering, zoom, text layer) and `TextViewer` (paginated `[PAGE N]` text fallback).
- Click-to-page navigation driven by `useResultsViewerStore` (`targetPage` / `scrollRequestId`).
- Source-sentence highlighting (`TermHighlightLayer`).
- `PageIndicator`, `ZoomControls` and `DownloadPdfLink`.
- Handling for signed URLs expiring.

**References:** engineering-doc §4.3 steps 8–9, §5.1 (react-pdf), §5.4 (responsive, reduced motion), §7.13 (1 h signed URLs), §8.8 (auto-highlight), §9.2 (`pdf_url`, `pdf_url_expires_at`). PRD US-003, US-006, FR-06, FR-07. External dependency mitigation: "download PDF fallback if rendering fails".

**Depends on:** `06-results-key-terms-panel.md` (`ResultsLayout`, `useContract`, `ContractDetail`), `00-foundation.md` (tokens, `public/pdf.worker.min.mjs` copy step), README §3.8 (`splitPages`, `pageAtOffset`), README §3.10 (`useResultsViewerStore`).

**Consumed by:** `06` (key-term navigation), `09-contract-chat.md` (`CitationLink` → `goToPage(page)` with no text).

---

## 2. User flow

1. The results page mounts `DocumentViewer`. If `pdf_url` is non-null the store's `viewerMode` starts as `'pdf'`; otherwise `'text'`.
2. **PDF mode:** react-pdf downloads the whole PDF once from the signed URL. Pages near the viewport render. The rest are fixed-height placeholders.
3. The user scrolls (`PageIndicator` updates "Page 3 of 6"), zooms (50%–200% in 25% steps), or uses Previous/Next page.
4. The user clicks a key term, page link or chat citation → `goToPage(page, { termId?, text? })` → `scrollRequestId` increments → the viewer scrolls to the page (smooth, or instant with reduced motion) and highlights:
   - the matching source-sentence spans when `text` is given and a match is found, or
   - the whole page (outline) when there is no text or no match.
5. If PDF loading or rendering fails, the viewer switches to `'text'` mode, shows a notice and offers "Download PDF" while a signed URL exists.
6. **Text mode:** the stored `contract_text` is split by `[PAGE N]` markers into labelled page sections. Navigation and highlighting behave the same.
7. The user can switch modes manually with "View as text" / "View PDF" (the latter only when a PDF is available and hasn't failed).
8. Before the 1 h signed URL expires, `useContract` refetches and gets a fresh URL for `DownloadPdfLink` and error recovery. The already-loaded document is not reloaded.

---

## 3. Database

No direct database access. Everything comes from `ContractDetail` (spec 06):

| Field | Use |
|---|---|
| `contract.contract_text` | `TextViewer` source |
| `contract.page_count` | Expected page total (fallback when the PDF reports none) |
| `pdf_url` | react-pdf `file` and the download link |
| `pdf_url_expires_at` | Refresh scheduling (§6.6) |
| `key_terms[].source_sentence`, `page_number` | Passed in through `goToPage` (not read here) |

---

## 4. Database tasks

None. Requires `contracts_objects_select_own` on `storage.objects` (already in `supabase-schema.sql`) so spec 06 can sign URLs.

---

## 5. API routes

None new. Uses `GET /api/contracts/{id}` (spec 06) for the signed URL and refreshes.

---

## 6. Backend implementation

There is no server code. All modules here are client-side. The shared text-matching utility is plain TypeScript, so it is unit-testable.

### 6.1 Packages and worker

| Package | Version rule |
|---|---|
| `react-pdf` | `^9` |
| `pdfjs-dist` | The exact version `react-pdf` depends on (`npm ls pdfjs-dist` must show a single version) |
| `react-resizable-panels` | Used by spec 06 |

- `scripts/copy-pdf-worker.mjs` copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdf.worker.min.mjs`. It runs in the `postinstall` and `prebuild` npm scripts (spec 00 owns `package.json`).
- In `src/components/viewer/PdfViewer.tsx`, at module scope: `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';`
- `import 'react-pdf/dist/Page/TextLayer.css';` The annotation layer CSS is **not** imported, because the annotation layer is disabled.
- `PdfViewer` is imported only through `next/dynamic(() => import('./PdfViewer'), { ssr: false, loading: () => <ViewerSkeleton /> })`.
- CSP (spec 00) must allow `worker-src 'self' blob:` and `connect-src` to the Supabase URL. This is already in engineering-doc §6.5.

### 6.2 Text matching — `src/lib/text/match.ts`

```ts
/** The ONE normalisation used for source-sentence matching, on the server (source verification,
 *  05 §6.6) and in the UI (highlighting). The rules are exactly those in 05 §6.6:
 *  [PAGE N] markers → one space; per char NFKC + lowercase; ‘ ’ ‚ ‛ ′ ´ ` → '; “ ” „ ‟ ″ → ";
 *  ‐ ‑ ‒ – — ― − → -; NBSP/any whitespace → space; soft hyphen dropped;
 *  line-wrap hyphen (-\n + lowercase letter) dropped; space runs collapsed; trimmed. */
export function normalizeForMatch(s: string): string;
/** Same rules, plus a map from each normalised char index to its original index. */
export function normalizeWithMap(text: string): { normalized: string; map: number[] };

/** Candidate needles in priority order. */
export function matchCandidates(sentence: string): string[] {
  const full = normalizeForMatch(sentence);
  const out = [full];
  if (full.length > 80) out.push(full.slice(0, 80));
  const clauses = full.split(/[.;:]/).map(c => c.trim()).filter(c => c.length >= 20)
                      .sort((a, b) => b.length - a.length);
  if (clauses[0] && clauses[0] !== full) out.push(clauses[0]);
  return [...new Set(out)].filter(n => n.length >= 12);
}

/** Finds `needle` (already normalised) in `haystack` (original text). Returns original-text offsets. */
export function findNormalizedRange(haystack: string, needle: string): { start: number; end: number } | null;
// Builds a normalised copy of haystack while recording, for each normalised char,
// the index of the original char it came from (collapsed whitespace maps to the first
// whitespace char). Searches with indexOf; maps [i, i + needle.length) back to
// [map[i], map[i + needle.length - 1] + 1).

/** Tries every candidate in order; first hit wins. */
export function findSentenceRange(haystack: string, sentence: string): { start: number; end: number } | null;
```

`05-key-term-extraction.md`'s `verifySourceSentence` imports `normalizeWithMap` and `normalizeForMatch` from this module, so the server and the UI agree on what "verified" means. `findNormalizedRange` is built on `normalizeWithMap`.

### 6.3 Page geometry and lazy rendering (inside `PdfViewer`)

- `containerRef` is the scroll container. A `ResizeObserver` keeps `containerWidth`.
- `baseWidth = Math.min(containerWidth - 32, 816)`. 816 px = US Letter at 96 dpi. 32 px = 16 px padding each side.
- `pageWidth = Math.round(baseWidth * zoom)`. When `zoom > 1` the container scrolls horizontally.
- `aspect`: from page 1's `onLoadSuccess(page)` → `page.originalHeight / page.originalWidth`. Default `1.294` (Letter) until known. Each page's own aspect is stored in `aspects: Map<number, number>` once loaded.
- Placeholder height = `pageWidth * (aspects.get(n) ?? aspect)`. The vertical gap between pages is 16 px.
- `pageRefs = useRef(new Map<number, HTMLDivElement>())`. Each page wrapper registers through a ref callback and has `data-page={n}`, `id="pdf-page-{n}"`, `tabIndex={-1}` and `aria-label="Page {n} of {total}"`.
- **IntersectionObserver** (`root: containerRef.current`, `rootMargin: '200% 0px'`, `threshold: [0, 0.25, 0.5, 0.75, 1]`) tracks `visibleRatios: Map<number, number>`.
- **Render window** = pages `[min(visible) - R, max(visible) + R]` clamped to `1..numPages`. `R = 2` normally and `R = 1` when `window.innerWidth < 768`. Pages outside the window render only the placeholder. This keeps memory bounded on mobile.
- The **current page** is the page with the highest intersection ratio (ties → lower page number). It feeds `PageIndicator`.
- `<Page>` props:

```tsx
<Page
  pageNumber={n} width={pageWidth}
  renderTextLayer renderAnnotationLayer={false}
  onLoadSuccess={(p) => recordAspect(n, p)}
  onRenderTextLayerSuccess={() => onTextLayerReady(n)}
  loading={<PagePlaceholder height={h} />}
/>
```

### 6.4 Navigation (both viewers)

`useViewerNavigation({ containerRef, pageRefs, numPages, ensureRendered })` in `src/components/viewer/useViewerNavigation.ts`:

1. Subscribes to `scrollRequestId` (Zustand selector). On change, reads `targetPage`, `highlightText` and `highlightTermId`.
2. `page = clamp(targetPage, 1, numPages)`. If `targetPage > numPages` (PDF has fewer pages than `page_count`), it scrolls to the last page and highlights the page only.
3. `ensureRendered(page)` widens the render window to include `page` before scrolling (PDF mode).
4. `const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;`
5. `pageRefs.get(page)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })`.
6. Clears the previous highlight, then requests the new one:
   - PDF mode: stores `pendingHighlight = { page, text }`, applied in `onTextLayerReady(page)`, or immediately if that page's text layer is already rendered.
   - Text mode: applied synchronously (§8.6).
7. Announces "Showing page {page}" through `PageIndicator`'s `aria-live="polite"` region. **Focus is not moved:** the user's focus stays in the key terms panel or chat.

### 6.5 `TermHighlightLayer` algorithm (PDF mode)

`applyPdfHighlight(pageEl: HTMLElement, text: string | null): 'spans' | 'page'`:

1. Remove `data-ciq-highlight` from every element in the viewer, and the `data-highlighted` attribute from every page wrapper.
2. If `text` is null or empty → page highlight (step 6).
3. `spans = pageEl.querySelectorAll('.react-pdf__Page__textContent span[role="presentation"], .react-pdf__Page__textContent > span')`. Ignore spans whose `textContent.trim()` is empty.
4. Build `joined` (spans joined with `' '`) and `ranges: { span; start; end }[]` with offsets into `joined`.
5. `range = findSentenceRange(joined, text)`. If found: every span whose `[start, end)` overlaps `range` gets `data-ciq-highlight="true"`. The first highlighted span is scrolled into view with `block: 'center'` (same smooth/reduced rule). Returns `'spans'`.
6. Not found → `pageEl.dataset.highlighted = 'page'`. Returns `'page'`.

Highlights persist until the next navigation request. Page-only highlights from a navigation **without** text (chat citations) are removed after 1,500 ms. Page highlights from a failed text match persist.

CSS (in `src/components/viewer/viewer.css`, imported by `PdfViewer`):

```css
.react-pdf__Page__textContent span[data-ciq-highlight='true'] {
  background-color: var(--color-yellow-200);
  mix-blend-mode: multiply;
  border-radius: 2px;
}
[data-page][data-highlighted='page'] {
  outline: 2px solid var(--color-yellow-500);
  outline-offset: 4px;
}
```

### 6.6 Signed-URL lifetime

- `signedUrlRefreshDelay(data?: ContractDetail): number | false` (`src/hooks/useContract.ts`, used as `refetchInterval` by spec 06):
  - `false` if `!data?.pdf_url_expires_at`.
  - Otherwise `max(expiresAt - Date.now() - 5 * 60_000, 10_000)`, so it refetches 5 minutes before expiry and no more often than every 10 s.
- The PDF is fetched **in full** once. Options are passed to `<Document>` and memoised with `useMemo` so the identity is stable:

```ts
const options = useMemo(() => ({ disableRange: true, disableStream: true, isEvalSupported: false }), []);
```

  So once loaded, the document never needs the URL again.
- `PdfViewer` keeps the **first** `pdfUrl` it receives in a `useRef` (`loadedUrlRef`) and passes that as `file`. Later prop changes do **not** reload the document (no scroll jump). They are used only by `DownloadPdfLink` and by the error recovery below.
- **Recovery:** on `onLoadError` / `onSourceError`, if `pdfUrlExpiresAt` is in the past and no retry has happened yet, `PdfViewer` calls `queryClient.refetchQueries({ queryKey: qk.contract(contractId) })`, then sets `loadedUrlRef.current` to the new `pdf_url` and remounts `<Document key={retryCount}>` once. A second failure falls back to text mode.

---

## 7. State management

| Source | State | Notes |
|---|---|---|
| `useResultsViewerStore` | `viewerMode`, `zoom`, `targetPage`, `scrollRequestId`, `highlightText`, `highlightTermId` | README §3.10. `goToPage` sets the target and text and increments `scrollRequestId` |
| `useContract` (06) | `pdf_url`, `pdf_url_expires_at`, `contract_text`, `page_count` | `refetchInterval = signedUrlRefreshDelay` |
| `PdfViewer` local | `numPages`, `aspects`, `visibleRatios`, `renderWindow`, `currentPage`, `loadState: 'loading' \| 'loaded' \| 'failed'`, `retryCount`, `loadedUrlRef`, `pendingHighlight` | |
| `TextViewer` local | `currentPage`, `highlight: { page; start; end } \| 'page' \| null` | |
| `DocumentViewer` local | `pdfFailed: boolean` | Set by `PdfViewer.onFatalError`. Hides the "View PDF" toggle |

Initial mode (`DocumentViewer` effect on mount and when `pdf_url` goes from null to non-null): `setViewerMode(pdfUrl && !pdfFailed ? 'pdf' : 'text')`.

Zoom: `setZoom(z)` clamps to `[0.5, 2]` and rounds to the nearest 0.25. Zoom is kept across mode switches but ignored in text mode.

---

## 8. Components

### 8.1 Tree

```
DocumentViewer
├── ViewerToolbar
│   ├── PageIndicator
│   ├── ZoomControls          (pdf mode only)
│   ├── ViewModeToggle        ("View as text" / "View PDF")
│   └── DownloadPdfLink       (when pdfUrl)
├── ViewerNotice              (pdf failed → text)
└── PdfViewer (dynamic, ssr:false) | TextViewer
    PdfViewer → <Document> → PdfPageSlot × numPages → (<Page> | PagePlaceholder)
    TextViewer → PageSection × pages
```

### 8.2 `DocumentViewer`

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `pageCount` | `number` |
| `contractText` | `string` |
| `pdfUrl` | `string \| null` |
| `pdfUrlExpiresAt` | `string \| null` |

Container: full panel height, flex column. The toolbar is 48 px tall (sticky top, white, 1 px Grey 100 bottom border). The viewer body is `flex: 1; overflow: auto` with a Grey 25 background.

### 8.3 `PdfViewer`

| Prop | Type |
|---|---|
| `contractId` | `string` |
| `pdfUrl` | `string` |
| `pdfUrlExpiresAt` | `string \| null` |
| `expectedPages` | `number` |
| `onFatalError` | `() => void` |
| `onCurrentPageChange` | `(page: number, total: number) => void` |

- `<Document file={loadedUrlRef.current} options={options} onLoadSuccess={({ numPages }) => …} onLoadError={handleError} onSourceError={handleError} loading={<ViewerSkeleton />} error={null}>`.
- `numPages` comes from the PDF. If it differs from `expectedPages`, log `console.warn('[viewer] page count mismatch', …)` and use `numPages`.
- `handleError`: try the recovery in §6.6. Otherwise call `onFatalError()`, which makes `DocumentViewer` set `pdfFailed = true` and `setViewerMode('text')`.
- A render error on a single `<Page>` (`onRenderError`) shows a page-level placeholder "This page couldn't be displayed." with a "View as text" button. It does not fail the whole document.
- Pages are centred horizontally with 16 px padding and a 16 px gap between them. Each page has a 1 px Grey 100 border on a white background.

### 8.4 `PageIndicator`

| Prop | Type |
|---|---|
| `current` | `number` |
| `total` | `number` |
| `onPrev` / `onNext` | `() => void` |

- Shows "Page {current} of {total}" (Paragraph Small) with icon buttons `ChevronUp` (`aria-label="Previous page"`) and `ChevronDown` (`aria-label="Next page"`). These are disabled at the bounds.
- Prev/Next call `goToPage(current ∓ 1)` with no text.
- Contains the `aria-live="polite"` region for navigation announcements.

### 8.5 `ZoomControls`

| Prop | Type |
|---|---|
| `zoom` | `number` |
| `onZoom` | `(z: number) => void` |

- Buttons: `ZoomOut` (`aria-label="Zoom out"`, disabled at 0.5), the value `{Math.round(zoom*100)}%` as a button that resets to 100% (`aria-label="Reset zoom to 100%"`), and `ZoomIn` (`aria-label="Zoom in"`, disabled at 2.0).
- Step 0.25.
- Keyboard shortcuts while focus is inside the viewer body: `Ctrl/⌘ +`, `Ctrl/⌘ -` and `Ctrl/⌘ 0` (these call `preventDefault` only inside the viewer).
- On zoom change the current page is kept in view: record `currentPage`, then after the re-render call `pageRefs.get(currentPage).scrollIntoView({ block: 'start' })` without smooth scrolling.

### 8.6 `TextViewer`

| Prop | Type |
|---|---|
| `contractText` | `string` |
| `pageCount` | `number` |
| `onCurrentPageChange` | `(page: number, total: number) => void` |

- `pages = useMemo(() => splitPages(contractText), [contractText])`. If there are no markers (defensive), it is treated as a single page 1.
- Renders `PageSection` per page: `<section id="text-page-{n}" data-page={n} tabIndex={-1} aria-labelledby="text-page-{n}-label">`. The header `<h3 id=…>` "Page {n}" is Paragraph Small Medium `--text-secondary`. The body `<p>` uses `white-space: pre-wrap; overflow-wrap: anywhere`, Paragraph Large (16/24 500), `--text-primary`. Max width 72ch, padding 24 px, white card, radius 8 px, 1 px Grey 100 border, 16 px gap between pages.
- Uses the same `useViewerNavigation` and IntersectionObserver current-page tracking. All sections render, because the text is small: ≤ 15k tokens.
- **Highlight:** `range = findSentenceRange(page.text, highlightText)`.
  - Found → the page text renders as `before` + `<mark data-ciq-highlight="true">` + `after`. The mark uses Yellow 200 background, Grey 900 text and radius 2 px. The mark is scrolled into view with `block: 'center'`.
  - Not found or no text → the section gets `data-highlighted="page"` (same outline CSS).
- Markers `[PAGE N]` are never shown in the body text.

### 8.7 `DownloadPdfLink`

| Prop | Type |
|---|---|
| `pdfUrl` | `string` |
| `fileName` | `string` |

`<a href={pdfUrl} download={fileName} target="_blank" rel="noopener noreferrer">`, with a `Download` icon and the text "Download PDF". It always uses the **latest** `pdf_url` from `useContract`. It is hidden when `pdfUrl` is null.

### 8.8 `ViewModeToggle` and `ViewerNotice`

- Toggle: a text button. In PDF mode it shows "View as text". In text mode it shows "View PDF", and only when `pdfUrl && !pdfFailed`.
- `ViewerNotice` (info style, `role="status"`) is shown in text mode:
  - When `pdfFailed`: "We couldn't display the PDF here, so you're seeing the extracted text. You can still download the original."
  - When `pdfUrl` is null: "The original PDF is no longer stored. You're viewing the extracted text."

### 8.9 States

| State | Rendering |
|---|---|
| Loading | `ViewerSkeleton` (toolbar plus 2 page-shaped Grey 50 blocks with a 300 ms fade) |
| Empty | Not possible: `contract_text` is required for `completed` |
| Error | Text fallback and `ViewerNotice`. A per-page render error shows a placeholder |
| Success | Rendered pages. Highlight on navigation |

### 8.10 Mobile behaviour (< 768 px)

- The viewer appears under the "Document" tab (spec 06 switches to it automatically on navigation).
- `pageWidth` fits the container (`containerWidth - 32`). The render window is ±1 page.
- `ZoomControls` stay available. Browser pinch-zoom is not blocked (no `user-scalable=no`).
- The toolbar wraps to two rows below 360 px.

---

## 9. Design

| Element | Tokens |
|---|---|
| Viewer background | `--bg-surface` (Grey 25) |
| Page / text card | `--bg-primary`, 1 px `--color-grey-100`, radius 8 px (text cards). PDF pages have radius 0 so the page edges stay true |
| Toolbar | White, 48 px, 1 px Grey 100 bottom border, 8 px gaps, icon buttons 32×32 with radius 6 px. Hover Grey 50, focus ring 2 px Blue 500 |
| Text | Paragraph Large (body), Paragraph Small (labels, indicator) |
| Highlight | Yellow 200 fill (spans / mark). Yellow 500 2 px outline (page) |
| Motion | Smooth scroll unless `prefers-reduced-motion: reduce`. Skeleton fade 300 ms ease-in-out |

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| `pdf_url` null | Text mode with the "no longer stored" notice. No toggle or download |
| PDF fails to load (CORS, corrupt, network) | One refresh-and-retry if the URL has expired, otherwise text mode, notice and download link |
| Signed URL expires while the page is open | No visible effect (the document is already in memory). `useContract` refreshes the URL 5 min before expiry for the download link |
| Tab left open for over an hour, then "Download PDF" | Uses the refreshed URL. If the refresh failed, the link is hidden when `pdf_url` becomes null |
| `targetPage` > PDF `numPages` | Scroll to the last page, page highlight |
| `targetPage` < 1 or null | Ignored |
| Same page and term clicked twice | `scrollRequestId` increments → re-scroll and re-highlight |
| Source sentence spans two pages | Match fails on the target page → page highlight. (Cross-page matching is out of scope for the MVP) |
| Ligatures or odd PDF text extraction (`ﬁ`, hyphenation) | NFKC + soft-hyphen removal. If there is still no match → page highlight |
| Text layer not rendered yet when navigation fires | `pendingHighlight` is applied on `onRenderTextLayerSuccess` |
| Zoom changed while a highlight is shown | The text layer re-renders. The `pendingHighlight` for the current target is re-applied |
| Rotated or landscape pages | The per-page aspect from `originalWidth/Height` gives the correct placeholder height |
| `contract_text` without `[PAGE N]` markers | Shown as one page. Navigation to N > 1 gives a page highlight on page 1 |
| Container width 0 (hidden tab) | Skip rendering until `ResizeObserver` reports a width > 0 |
| Reduced motion | `behavior: 'auto'`. No fades |

---

## 11. Acceptance criteria

- [ ] All pages of a 20-page fixture render as the user scrolls. At most `visible ± 2` pages (± 1 on mobile) are mounted as `<Page>` at any time.
- [ ] Zoom works from 50% to 200% in 25% steps through buttons and keyboard. The current page stays in view.
- [ ] Clicking a page reference or term scrolls the viewer to that page (US-003, FR-07) and highlights the matching source sentence spans when found, otherwise the page.
- [ ] Chat citation navigation (no text) scrolls and flashes a page outline for 1.5 s.
- [ ] With `pdf_url = null`, or a forced PDF load error, the text viewer renders every page with a "Page N" label and supports the same navigation and highlighting (FR-06).
- [ ] After a PDF failure a "Download PDF" link is offered while a signed URL exists.
- [ ] An expired signed URL never interrupts an already-loaded document. A URL refresh is scheduled 5 min before expiry.
- [ ] `prefers-reduced-motion: reduce` gives instant scrolling.
- [ ] Navigation announces "Showing page N" through an aria-live region and does not steal focus.
- [ ] The viewer toolbar is fully keyboard operable with visible focus.

---

## 12. Tests

**Unit (Vitest)**
- `normalizeForMatch`: curly quotes, en/em dashes, NBSP, soft hyphen, multiple spaces, NFKC ligature `ﬁ` → `fi`.
- `findNormalizedRange`: maps back to the correct original offsets when the original has double spaces and line breaks.
- `matchCandidates`: long sentence → [full, first 80, longest clause]; dedupes; drops needles shorter than 12 chars.
- `findSentenceRange`: exact hit; hit through the 80-char prefix after a mid-sentence extraction artefact; miss → null.
- `signedUrlRefreshDelay`: null → false; expiry in 60 min → ≈ 55 min; already expired → 10 s.
- `useResultsViewerStore`: `goToPage` increments `scrollRequestId`; `setZoom(0.3)` → 0.5; `setZoom(1.6)` → 1.5.

**Component (RTL + jsdom; react-pdf mocked)**
- `TextViewer`: renders N sections from `[PAGE N]` markers, never shows the markers, renders `<mark>` for a matching sentence, and sets `data-highlighted="page"` for a non-match.
- `DocumentViewer`: `pdfUrl = null` → text mode and the notice; `onFatalError` → text mode, notice and download link; the toggle is hidden after a failure.
- `ZoomControls`: disabled states at the bounds; the reset button shows 100%.
- `PageIndicator`: prev disabled on page 1; the aria-live text updates.

**E2E (Playwright, real PDF.js)**
- `viewer.spec.ts`: open a completed 6-page NDA fixture → click "Governing Law" (page 5) → page 5 is in the viewport and a `[data-ciq-highlight="true"]` span exists → zoom in twice → the indicator still shows page 5.
- `viewer-fallback.spec.ts`: route-intercept the signed URL with 403 → the text viewer shows "Page 1" … "Page 6" → clicking a term scrolls to `#text-page-5` → `<mark>` is visible.
- `mobile-viewer.spec.ts` (375×812): Key Terms tab → click a term → switches to the Document tab and shows the target page.
