'use client';

import type { ContractType } from '@/types/domain';

const QUESTIONS: Record<ContractType, string[]> = {
  nda: [
    'What happens if I breach this NDA?',
    'How long do the confidentiality obligations last?',
    'What information can I share without breaking this NDA?',
  ],
  msa: ['Is there an auto-renewal clause?', 'What is the liability cap?', 'How much notice do I need to give to terminate?'],
};

export function SuggestedQuestions({ contractType, onSelect, disabled }: { contractType: ContractType; onSelect: (q: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm text-fg-secondary">Try asking:</p>
      <ul className="flex flex-col gap-2">
        {QUESTIONS[contractType].map((q) => (
          <li key={q}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(q)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-left text-body-sm font-medium text-fg-primary transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:text-fg-disabled"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
