// Optional LLM judge for semantic terms (15-evals.md §6.6.3). Secondary: it can rescue a rules miss,
// never remove a rules match, and CI gates always use the rules-only F1.
import type OpenAI from 'openai';
import type { TermLabel } from './load-dataset';

export type JudgeVerdict = 'YES' | 'NO' | 'MISS';

const SYSTEM = 'You grade contract term extractions. Answer YES or NO only.';
export const JUDGE_MODEL = 'gpt-4o';

/**
 * Calls the judge through the eval client (so judge calls are recorded and replayed). A replay miss
 * or API error is 'MISS', which counts as NO and is listed in the summary.
 */
export async function judgeSemantic(
  client: OpenAI,
  p: { termName: string; label: Extract<TermLabel, { present: true }>; aiValue: string },
): Promise<JudgeVerdict> {
  const user =
    `Term: ${p.termName}\nReference answer: ${p.label.expected_value}\n` +
    `Required elements: ${(p.label.required_elements ?? []).map((g) => g.join(' / ')).join('; ')}\n` +
    `Candidate answer: ${p.aiValue}\n` +
    'Does the candidate convey every required element without contradicting the reference? Answer YES or NO.';
  try {
    const res = await client.chat.completions.create({
      model: JUDGE_MODEL,
      temperature: 0,
      max_tokens: 5,
      seed: 7,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    });
    return /^\s*yes/i.test(res.choices[0]?.message?.content ?? '') ? 'YES' : 'NO';
  } catch {
    return 'MISS';
  }
}
