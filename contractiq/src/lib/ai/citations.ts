import type { ChatQueryType } from '@/types/domain';

/**
 * `[Page X]` citations in an answer (09 §6.10). Out-of-range pages are dropped from cited_pages (the text
 * is stored unchanged); matching is case-insensitive.
 */
export function parseCitations(text: string, pageCount: number | null, queryType: ChatQueryType) {
  const pages = new Set<number>();
  for (const m of text.matchAll(/\[Page (\d+)\]/gi)) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && (pageCount == null || n <= pageCount)) pages.add(n);
  }
  const citedPages = [...pages].sort((a, b) => a - b);
  const isNotFound = /I cannot find this in the document/i.test(text);
  const citationMissing = !isNotFound && queryType !== 'history' && citedPages.length === 0;
  return { citedPages, isNotFound, citationMissing };
}
