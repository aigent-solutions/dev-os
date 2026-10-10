// Value normalisers for term matching (15-evals.md §6.6.1–6.6.2).
import { isValid, parse } from 'date-fns';

/** NFKC, lowercase, fold quotes/&/dashes, drop quote chars, collapse spaces, strip trailing .,;: and a leading article. */
export function normaliseText(s: string): string {
  let t = s.normalize('NFKC').toLowerCase();
  t = t
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .replace(/^(the|a) /, '');
  return t;
}

// ── Amounts ────────────────────────────────────────────────────────────────────

export type Amount = { value: number; unit: string };

const CURRENCY: Record<string, string> = {
  $: 'USD', usd: 'USD', dollar: 'USD', dollars: 'USD', 'us$': 'USD',
  '£': 'GBP', gbp: 'GBP', pound: 'GBP', pounds: 'GBP',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
};
const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9 };

const AMOUNT_RE =
  /(us\$|\$|£|€|\busd\b|\bgbp\b|\beur\b)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(thousand|million|billion|mn|bn|k|m)?\b\s*(%|percent\b|per cent\b|usd\b|gbp\b|eur\b|dollars?\b|pounds?\b|euros?\b)?/gi;

/**
 * Currency amounts and percentages in a value: "$1,000,000" = "USD 1 million", "£500k" = "GBP 500,000",
 * "1.5%" = "1.5 percent". Bare numbers (days, counts) are ignored unless the value has no tagged amount.
 */
export function parseAmounts(value: string): Amount[] {
  const tagged: Amount[] = [];
  const bare: Amount[] = [];
  for (const m of value.matchAll(AMOUNT_RE)) {
    const [, pre, int, frac, scale, post] = m;
    let n = Number(`${int!.replace(/,/g, '')}${frac ? `.${frac}` : ''}`);
    if (scale) n *= SCALE[scale.toLowerCase()]!;
    const suffix = post?.toLowerCase().trim();
    let unit = '';
    if (suffix === '%' || suffix === 'percent' || suffix === 'per cent') unit = '%';
    else if (pre) unit = CURRENCY[pre.toLowerCase()] ?? '';
    else if (suffix) unit = CURRENCY[suffix] ?? '';
    (unit ? tagged : bare).push({ value: n, unit });
  }
  return tagged.length ? tagged : bare;
}

/** Multiset equality with numeric tolerance 1e-6 and identical units. */
export function amountsEqual(a: Amount[], b: Amount[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...b];
  for (const x of a) {
    const i = left.findIndex((y) => y.unit === x.unit && Math.abs(y.value - x.value) <= 1e-6);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

// ── Durations ──────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "thirty-six" → 36, "twelve" → 12, "6" → 6; null if not a number. */
export function parseNumberWord(word: string): number | null {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  if (w in UNITS) return UNITS[w]!;
  if (w in TEENS) return TEENS[w]!;
  if (w in TENS) return TENS[w]!;
  const [t, u] = w.split('-');
  if (t && u && t in TENS && u in UNITS) return TENS[t]! + UNITS[u]!;
  return null;
}

/**
 * A duration in a comparable form. Days and weeks compare in days; months and years compare in months
 * (a year is 12 months), so "thirty-six (36) months" = "3 years" while "90 days" ≠ "3 months".
 */
export type Duration = { amount: number; family: 'days' | 'months' };

const DURATION_RE = /\b(\d+|[a-z]+(?:-[a-z]+)?)\s*(?:\(\s*\d+\s*\)\s*)?(day|week|month|year)s?\b/gi;

export function parseDuration(value: string): Duration | null {
  for (const m of value.matchAll(DURATION_RE)) {
    const n = parseNumberWord(m[1]!);
    if (n === null) continue;
    const unit = m[2]!.toLowerCase();
    if (unit === 'day') return { amount: n, family: 'days' };
    if (unit === 'week') return { amount: n * 7, family: 'days' };
    if (unit === 'month') return { amount: n, family: 'months' };
    return { amount: n * 12, family: 'months' };
  }
  return null;
}

// ── Dates ──────────────────────────────────────────────────────────────────────

const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december)';
const DATE_PATTERNS: { re: RegExp; formats: (ukFirst: boolean) => string[] }[] = [
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day of\\s+)?${MONTH},?\\s+(\\d{4})\\b`, 'i'), formats: () => ['d MMMM yyyy'] },
  { re: new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'), formats: () => ['MMMM d yyyy'] },
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, formats: () => ['yyyy-MM-dd'] },
  { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, formats: (uk) => (uk ? ['dd/MM/yyyy', 'MM/dd/yyyy'] : ['MM/dd/yyyy', 'dd/MM/yyyy']) },
];

/** ISO yyyy-MM-dd of the first date in `value`, or null (e.g. a relative date). UK ordering first when ukFirst. */
export function parseDate(value: string, ukFirst: boolean): string | null {
  for (const { re, formats } of DATE_PATTERNS) {
    const m = value.match(re);
    if (!m) continue;
    const raw = m[0]
      .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
      .replace(/day of\s+/i, '')
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (const f of formats(ukFirst)) {
      const d = parse(raw, f, new Date(2000, 0, 1));
      if (isValid(d)) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
    }
  }
  return null;
}
