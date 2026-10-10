import { findSentenceRange } from '@/lib/text/match';

const SPAN_SELECTOR = '.react-pdf__Page__textContent span[role="presentation"], .react-pdf__Page__textContent > span';

/** Removes every span and page highlight inside `root`. */
export function clearHighlights(root: HTMLElement): void {
  root.querySelectorAll('[data-ciq-highlight]').forEach((el) => el.removeAttribute('data-ciq-highlight'));
  root.querySelectorAll('[data-highlighted]').forEach((el) => el.removeAttribute('data-highlighted'));
}

/**
 * PDF mode (07 §6.5): marks the text-layer spans that overlap the matched source sentence, or outlines the
 * whole page when there's no text or no match. Returns what was highlighted and the first span, if any.
 */
export function applyPdfHighlight(
  root: HTMLElement,
  pageEl: HTMLElement,
  text: string | null,
): { kind: 'spans' | 'page'; firstSpan: HTMLElement | null } {
  clearHighlights(root);
  if (text) {
    const spans = [...pageEl.querySelectorAll<HTMLElement>(SPAN_SELECTOR)].filter((s) => (s.textContent ?? '').trim());
    const ranges: { span: HTMLElement; start: number; end: number }[] = [];
    let joined = '';
    for (const span of spans) {
      if (joined) joined += ' ';
      const start = joined.length;
      joined += span.textContent ?? '';
      ranges.push({ span, start, end: joined.length });
    }
    const range = findSentenceRange(joined, text);
    if (range) {
      const hit = ranges.filter((r) => r.start < range.end && r.end > range.start);
      hit.forEach((r) => r.span.setAttribute('data-ciq-highlight', 'true'));
      if (hit.length) return { kind: 'spans', firstSpan: hit[0]!.span };
    }
  }
  pageEl.dataset.highlighted = 'page';
  return { kind: 'page', firstSpan: null };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scrolls only `container` (never the window, which would hide the header and the terms panel) so that
 * `el` sits at the top, or centred.
 */
export function scrollWithin(container: HTMLElement, el: HTMLElement, block: 'start' | 'center'): void {
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  let top = e.top - c.top + container.scrollTop;
  if (block === 'center') top -= (container.clientHeight - e.height) / 2;
  else top -= 16; // keep the page's top gap visible
  container.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
