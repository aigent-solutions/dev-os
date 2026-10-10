import { FileSearch, Gauge, PencilLine, Quote, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileSearch, title: 'Page-level references', body: 'Click any term to jump to the exact page in your PDF.' },
  { icon: Gauge, title: 'Confidence you can see', body: 'Green, amber and red scores show what to double-check. Low-confidence terms are always flagged.' },
  { icon: Quote, title: 'Source sentences', body: 'Every value shows the sentence from your contract it was taken from.' },
  { icon: PencilLine, title: 'Fix anything', body: 'Edit any term inline. Your edits are saved and marked.' },
];

/** Four features, 2×2 from md (02 §8.4). */
export function FeatureGrid() {
  return (
    <section aria-label="Built for people without a legal team" className="flex flex-col gap-6">
      <SectionHeader title="Built for people without a legal team" />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Card as="article" padding="lg" className="flex h-full items-start gap-4">
              <Icon aria-hidden className="h-6 w-6 shrink-0 text-fg-secondary" />
              <div className="flex flex-col gap-1">
                <h3 className="text-body-lg text-fg-primary">{title}</h3>
                <p className="text-body-sm text-fg-secondary">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
