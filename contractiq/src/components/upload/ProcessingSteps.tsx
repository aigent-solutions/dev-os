import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['Extracting text', 'Analysing with AI', 'Compiling results'] as const;

export type ProcessingStepsProps = { current: 1 | 2 | 3; done?: boolean };

/** The 3-step progress list (05 §8.2). Steps before `current` are done; `current` is active. */
export function ProcessingSteps({ current, done = false }: ProcessingStepsProps) {
  return (
    <ol aria-live="polite" aria-label="Analysis progress" className="flex flex-col gap-3">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = done || n < current ? 'done' : n === current ? 'active' : 'pending';
        return (
          <li
            key={label}
            aria-current={state === 'active' ? 'step' : undefined}
            className={cn('flex items-center gap-3 text-body-lg', state === 'pending' ? 'text-fg-secondary' : 'text-fg-primary')}
          >
            {state === 'done' && <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success-fg" />}
            {state === 'active' && <Loader2 aria-hidden className="h-5 w-5 shrink-0 animate-spin text-brand motion-reduce:animate-none" />}
            {state === 'pending' && <Circle aria-hidden className="h-5 w-5 shrink-0 text-fg-disabled" />}
            {label}
            <span className="sr-only">{state === 'done' ? '(done)' : state === 'active' ? '(in progress)' : '(not started)'}</span>
          </li>
        );
      })}
    </ol>
  );
}
