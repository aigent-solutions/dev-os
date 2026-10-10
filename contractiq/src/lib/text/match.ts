// The one normalisation for source-sentence matching, shared by server-side verification
// (05-key-term-extraction.md §6.6, canonical rules) and viewer highlighting (07 §6.2, which adds
// findSentenceRange in F9).
const MARKER_AT = /^\[PAGE \d+\]/;
const SINGLE_QUOTES = new Set(['‘', '’', '‚', '‛', '′', '´', '`']);
const DOUBLE_QUOTES = new Set(['“', '”', '„', '‟', '″']);
const DASHES = new Set(['‐', '‑', '‒', '–', '—', '―', '−']);

/** Normalised text plus, for each normalised char, the index of the original char it came from. */
export function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  const push = (ch: string, origin: number) => {
    if (ch === ' ' && (out.length === 0 || out.endsWith(' '))) {
      if (out.length === 0) {
        out += ' ';
        map.push(origin);
      }
      return; // collapse runs: only the first space keeps a map entry
    }
    out += ch;
    map.push(origin);
  };

  let i = 0;
  while (i < text.length) {
    const marker = text.charCodeAt(i) === 91 /* [ */ ? MARKER_AT.exec(text.slice(i, i + 16)) : null;
    if (marker) {
      push(' ', i);
      i += marker[0].length;
      continue;
    }
    const ch = text[i]!;
    // Line-wrap hyphen: "-\n" followed by a lowercase letter → drop both.
    if ((ch === '-' || DASHES.has(ch)) && text[i + 1] === '\n' && /\p{Ll}/u.test(text[i + 2] ?? '')) {
      i += 2;
      continue;
    }
    if (ch === '­') {
      i += 1;
      continue;
    }
    let mapped: string;
    if (SINGLE_QUOTES.has(ch)) mapped = "'";
    else if (DOUBLE_QUOTES.has(ch)) mapped = '"';
    else if (DASHES.has(ch)) mapped = '-';
    else if (/\s/.test(ch)) mapped = ' ';
    else mapped = ch.normalize('NFKC').toLowerCase();
    for (const c of mapped) push(/\s/.test(c) ? ' ' : c, i);
    i += 1;
  }
  return { normalized: out, map };
}

export function normalizeForMatch(s: string): string {
  return normalizeWithMap(s).normalized.trim();
}

/** Candidate needles in priority order: full sentence, its first 80 chars, its longest clause (07 §6.2). */
export function matchCandidates(sentence: string): string[] {
  const full = normalizeForMatch(sentence);
  const out = [full];
  if (full.length > 80) out.push(full.slice(0, 80));
  const clauses = full
    .split(/[.;:]/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 20)
    .sort((a, b) => b.length - a.length);
  if (clauses[0] && clauses[0] !== full) out.push(clauses[0]);
  return [...new Set(out)].filter((n) => n.length >= 12);
}

/** Finds an already-normalised `needle` in `haystack` (original text); returns original-text offsets. */
export function findNormalizedRange(haystack: string, needle: string): { start: number; end: number } | null {
  if (!needle) return null;
  const { normalized, map } = normalizeWithMap(haystack);
  const i = normalized.indexOf(needle);
  if (i === -1) return null;
  const start = map[i];
  const last = map[i + needle.length - 1];
  if (start === undefined || last === undefined) return null;
  return { start, end: last + 1 };
}

/** Tries every candidate in order; the first hit wins. */
export function findSentenceRange(haystack: string, sentence: string): { start: number; end: number } | null {
  for (const candidate of matchCandidates(sentence)) {
    const range = findNormalizedRange(haystack, candidate);
    if (range) return range;
  }
  return null;
}
