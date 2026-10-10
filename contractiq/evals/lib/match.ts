// Term matching rules (15-evals.md §6.6.2). Rules mode only; the LLM judge lives in judge.ts.
import type { TermLabel } from './load-dataset';
import { amountsEqual, normaliseText, parseAmounts, parseDate, parseDuration } from './normalise';

type Present = Extract<TermLabel, { present: true }>;

/** expected_value or any acceptable variant is a substring of the normalised AI value. */
function exactNormalised(label: Present, ai: string): boolean {
  const n = normaliseText(ai);
  return [label.expected_value, ...(label.acceptable_variants ?? [])].some((v) => {
    const want = normaliseText(v);
    return want.length > 0 && n.includes(want);
  });
}

/** Does the (non-null) AI value match a present label? `jurisdiction` picks UK vs US date order. */
export function matchTerm(label: Present, aiValue: string, ctx: { jurisdiction: string }): boolean {
  switch (label.match_type) {
    case 'exact_normalised': {
      if (label.expected_parties?.length) {
        const n = normaliseText(aiValue);
        return label.expected_parties.every((group) => group.some((v) => n.includes(normaliseText(v))));
      }
      return exactNormalised(label, aiValue);
    }
    case 'numeric': {
      const expected = parseAmounts(label.expected_value);
      if (!expected.length) return exactNormalised(label, aiValue);
      return amountsEqual(parseAmounts(aiValue), expected) || (label.acceptable_variants ?? []).some((v) => amountsEqual(parseAmounts(aiValue), parseAmounts(v)));
    }
    case 'duration': {
      if (label.survives_termination && !/surviv/i.test(aiValue)) return false;
      const got = parseDuration(aiValue);
      if (!got) return false;
      return [label.expected_value, ...(label.acceptable_variants ?? [])].some((v) => {
        const want = parseDuration(v);
        return !!want && want.family === got.family && want.amount === got.amount;
      });
    }
    case 'date': {
      const uk = ctx.jurisdiction.startsWith('UK');
      const want = parseDate(label.expected_value, uk);
      if (!want) return exactNormalised(label, aiValue); // relative date ("the date of last signature")
      return parseDate(aiValue, uk) === want;
    }
    case 'semantic': {
      const n = normaliseText(aiValue);
      return (label.required_elements ?? []).every((group) => group.some((syn) => n.includes(normaliseText(syn))));
    }
  }
}
