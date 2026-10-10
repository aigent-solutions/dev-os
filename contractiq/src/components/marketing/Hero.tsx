import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export const DEMO_ALT =
  'Demo: uploading an NDA, reviewing extracted key terms with page numbers and confidence scores, and asking a question in chat';

/** Value proposition, CTAs and the demo (02 §8.2). Text and media stack below 1024 px. */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Badge tone="brand">For NDAs and MSAs</Badge>
        <h1 id="hero-heading" className="text-h2 text-fg-primary md:text-h1">
          Understand any NDA or MSA in minutes — not hours
        </h1>
        <p className="max-w-prose text-body-lg text-fg-secondary">
          ContractIQ pulls out the terms that matter — payment, liability, IP, termination and more — tells you the exact page
          each one is on, and shows how confident it is. Then you can ask follow-up questions in plain English.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/signup">Get Started Free</Link>
            </Button>
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
          <p className="text-body-sm text-fg-secondary">14-day free trial · No credit card required · Text-based PDFs up to 20 pages</p>
        </div>
      </div>
      {/* The poster sits behind the GIF, so a failed load still shows the first frame (02 §10). */}
      <Card className="overflow-hidden bg-[url('/demo-poster.png')] bg-cover bg-center p-0">
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcSet="/demo-poster.png" />
          {/* eslint-disable-next-line @next/next/no-img-element -- an animated GIF with a reduced-motion <source>; next/image supports neither */}
          <img src="/demo.gif" alt={DEMO_ALT} width={1200} height={750} loading="eager" className="block h-auto w-full" />
        </picture>
      </Card>
    </section>
  );
}
