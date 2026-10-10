import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const RULES = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'A letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { label: 'A number', test: (p: string) => /[0-9]/.test(p) },
];

/** Live password requirements under the sign-up password field (01-auth.md §8.3). */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul aria-live="polite" aria-label="Password requirements" className="flex flex-col gap-0.5">
      {RULES.map(({ label, test }) => {
        const met = test(password);
        const Icon = met ? Check : Circle;
        return (
          <li key={label} className={cn('flex items-center gap-1 text-body-sm', met ? 'text-success-fg' : 'text-fg-secondary')}>
            <Icon aria-hidden className="h-3 w-3 shrink-0" />
            {label}
            <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
