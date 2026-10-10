import { CheckCircle2 } from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

const POINTS = [
  'Your files are private to your account and encrypted at rest and in transit.',
  'We never use your contracts to train AI models.',
  'Uploaded PDFs are deleted automatically 90 days after you last open them, and you can delete everything at any time.',
];

/** Privacy promises + the always-visible "not legal advice" notice (02 §8.5). */
export function TrustSection() {
  return (
    <section aria-label="Your contracts stay yours" className="flex flex-col gap-6">
      <SectionHeader title="Your contracts stay yours" />
      <Card padding="lg">
        <ul className="flex flex-col gap-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-body-lg font-normal text-fg-primary">
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-fg-secondary" />
              {p}
            </li>
          ))}
        </ul>
      </Card>
      <Banner tone="info">ContractIQ is an AI-assisted review tool, not legal advice. Always verify critical terms with a qualified lawyer.</Banner>
    </section>
  );
}
