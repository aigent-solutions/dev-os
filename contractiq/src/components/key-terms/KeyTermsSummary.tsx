import { AlertTriangle } from 'lucide-react';
import { Fragment } from 'react';
import { confidenceBand, type KeyTerm } from '@/types/domain';

/**
 * "{total} terms · {high} high · {medium} medium · {low} low confidence · {notFound} not found" (06 §8.9).
 * Real spaces around the separators so the line reads correctly as text, not just visually.
 */
export function KeyTermsSummary({ terms }: { terms: KeyTerm[] }) {
  const count = (band: ReturnType<typeof confidenceBand>) => terms.filter((t) => confidenceBand(t.confidence_score) === band).length;
  const low = count('low');
  const parts = [
    <span key="total">{terms.length} terms</span>,
    <span key="high">{count('high')} high</span>,
    <span key="medium">{count('medium')} medium</span>,
    low > 0 ? (
      <span key="low" className="inline-flex items-center gap-1 font-medium text-danger-fg">
        <AlertTriangle aria-hidden className="h-3 w-3" />
        {low} low confidence
      </span>
    ) : (
      <span key="low">0 low confidence</span>
    ),
    <span key="nf">{terms.filter((t) => t.value === null).length} not found</span>,
  ];
  return (
    <p className="text-body-sm text-fg-secondary">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  );
}
