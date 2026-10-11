// Prompt-injection fence (docs/security/security-plan.md §4). Contract text is untrusted — it is often written
// by the other party — so both prompts fence it in <contract>…</contract> and tell the model to treat it as
// data. A document containing those tags itself could close the fence early and put its own instructions
// outside it. Every tag the prompts use is rewritten before contract text is placed in a prompt.
// Deliberately no phrase blocklist (decision, Stage 7): legal questions such as "can the supplier act as our
// agent?" would be refused.

/** <contract …>, </contract>, <terms>, </terms>, with any spacing, attributes or case. */
const PROMPT_TAG = /<\s*(\/?)\s*(contract|terms)\b([^<>]*)>/gi;

/**
 * Replaces the angle brackets of prompt tags with ‹ › (U+2039/U+203A), so the text still reads naturally but
 * can no longer open or close a fence. Text without such tags is returned unchanged.
 */
export function neutralisePromptTags(text: string): string {
  return text.replace(PROMPT_TAG, (_m, slash: string, name: string, rest: string) => `‹${slash}${name}${rest}›`);
}
