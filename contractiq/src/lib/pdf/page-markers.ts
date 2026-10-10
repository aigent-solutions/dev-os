// [PAGE N] markers in contracts.contract_text (03-upload-extraction.md §6.5). Shared with 05 and 07.
export const PAGE_MARKER_REGEX = /\[PAGE (\d+)\]/g;

export function pageMarker(n: number): string {
  return `[PAGE ${n}]`;
}

export function splitPages(text: string): { page: number; text: string }[] {
  const re = new RegExp(PAGE_MARKER_REGEX.source, 'g');
  const pages: { page: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  let prev: { page: number; start: number } | null = null;
  while ((m = re.exec(text))) {
    if (prev) pages.push({ page: prev.page, text: text.slice(prev.start, m.index).trim() });
    prev = { page: Number(m[1]), start: m.index + m[0].length };
  }
  if (prev) pages.push({ page: prev.page, text: text.slice(prev.start).trim() });
  return pages;
}

/** Page of the nearest [PAGE N] marker at or before `offset`; null if none. */
export function pageAtOffset(text: string, offset: number): number | null {
  const re = new RegExp(PAGE_MARKER_REGEX.source, 'g');
  let page: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index <= offset) page = Number(m[1]);
  return page;
}
