import { MessageSquare, Sparkles, Upload, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Upload, title: 'Upload your contract', body: 'Choose NDA or MSA and drop in a PDF. Add up to 5 custom terms you care about.' },
  { icon: Sparkles, title: 'Get the key terms', body: "See each term's value, the page it's on, a confidence score, and the exact sentence it came from." },
  { icon: MessageSquare, title: 'Ask anything', body: "Chat with your contract. Every answer cites the page, and if it's not in the document, we'll say so." },
];

/** Three steps (02 §8.3); stacked below 768 px. */
export function HowItWorks() {
  return (
    <section aria-label="How it works" className="flex flex-col gap-6">
      <SectionHeader title="How it works" />
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title}>
            <Card as="article" padding="lg" className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between">
                <Badge>Step {i + 1}</Badge>
                <Icon aria-hidden className="h-6 w-6 text-fg-secondary" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-body-lg text-fg-primary">{title}</h3>
                <p className="text-body-sm text-fg-secondary">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
