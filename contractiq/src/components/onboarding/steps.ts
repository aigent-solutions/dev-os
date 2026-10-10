// First-run onboarding tips (14-onboarding-a11y.md §2.1). Copy is fixed by the spec table.
export type OnboardingPage = 'dashboard' | 'upload' | 'results';
export type OnboardingStepId = 'D1' | 'U1' | 'R1' | 'R2' | 'R3';

export type OnboardingStep = {
  id: OnboardingStepId;
  page: OnboardingPage;
  /** Value of the `data-onboarding` attribute on the anchor element. */
  anchor: string;
  title: string;
  body: string;
  /** 1..5 for the "n of 5" counter, counted across the whole tour. */
  index: number;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'D1',
    page: 'dashboard',
    anchor: 'review-cta',
    title: 'Start here',
    body: "Upload an NDA or MSA as a PDF (up to 20 pages). We'll pull out the key terms in about 30 seconds.",
    index: 1,
  },
  {
    id: 'U1',
    page: 'upload',
    anchor: 'term-preview',
    title: "What we'll look for",
    body: 'These are the terms we extract for this contract type. Add up to 5 of your own with “+ Add Key Term”.',
    index: 2,
  },
  {
    id: 'R1',
    page: 'results',
    anchor: 'confidence-badge',
    title: 'How sure is the AI?',
    body: 'Green means high confidence, amber means check it, and red ⚠️ means verify it in the document yourself.',
    index: 3,
  },
  {
    id: 'R2',
    page: 'results',
    anchor: 'why-toggle',
    title: 'See the source',
    body: 'Open “Why?” to see the exact sentence from your contract that each value came from. Click the page number to jump there.',
    index: 4,
  },
  {
    id: 'R3',
    page: 'results',
    anchor: 'chat-tab',
    title: 'Ask questions',
    body: 'Ask anything in plain English. Answers come only from your contract and cite the page.',
    index: 5,
  },
];

export const ONBOARDING_TOTAL = ONBOARDING_STEPS.length;

export function stepsForPage(page: OnboardingPage): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((s) => s.page === page);
}
