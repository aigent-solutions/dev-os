import { pageAtOffset } from '@/lib/pdf/page-markers';
import { normalizeForMatch, normalizeWithMap } from '@/lib/text/match';

const MIN_NEEDLE = 12;
const LONG_NEEDLE = 120;
const PREFIX = 80;

/** Strips surrounding whitespace and quotes, and trailing sentence punctuation. */
function cleanNeedle(sentence: string): string {
  return normalizeForMatch(sentence)
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/[.;,:]+$/, '')
    .trim();
}

/**
 * Is `sentence` (normalised) present in the contract text? Returns the original-text offset of the
 * first occurrence and its page from the nearest preceding [PAGE N] marker (05 §6.6).
 */
export function verifySourceSentence(
  contractText: string,
  sentence: string,
): { found: boolean; offset: number | null; page: number | null } {
  const notFound = { found: false, offset: null, page: null };
  const needle = cleanNeedle(sentence);
  if (needle.length < MIN_NEEDLE) return notFound;

  const { normalized, map } = normalizeWithMap(contractText);
  let idx = normalized.indexOf(needle);
  if (idx === -1 && needle.length > LONG_NEEDLE) idx = normalized.indexOf(needle.slice(0, PREFIX));
  if (idx === -1) return notFound;

  const offset = map[idx] ?? 0;
  return { found: true, offset, page: pageAtOffset(contractText, offset) };
}
