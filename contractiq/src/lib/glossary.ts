// Product vocabulary in plain English, ≤ 160 chars each (14-onboarding-a11y.md §7.2, PRD §5).
export const GLOSSARY = {
  confidence: 'How sure the AI is that it found the right value. 80%+ is high, 50–79% means check it, under 50% means verify it yourself.',
  source_sentence: 'The exact sentence from your contract that the value was taken from.',
  custom_term: 'A term you asked us to look for. It is extracted the same way as standard terms.',
  type_mismatch: 'The document looks like a different contract type than the one you chose, so some terms may be missing.',
  edited: 'You changed this value. The original AI value is kept for reference.',
  not_found: 'We could not find this term in the document. That can be correct — not every contract has every clause.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
