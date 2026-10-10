import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountDeletedToast } from '@/components/marketing/AccountDeletedToast';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { TrustSection } from '@/components/marketing/TrustSection';
import { PageContainer } from '@/components/ui/PageContainer';

export const dynamic = 'force-static';

const description =
  'Upload an NDA or MSA and get the key terms, page references and confidence scores in under 30 seconds. Ask follow-up questions in plain English.';

// Absolute: the root layout's "%s · ContractIQ" template would otherwise repeat the name (02 §6.1).
export const metadata: Metadata = {
  title: { absolute: 'ContractIQ — Understand your NDAs and MSAs in minutes' },
  description,
  openGraph: { title: 'ContractIQ', description, images: ['/og-image.png'], type: 'website' },
  robots: { index: true, follow: true },
};

/** Static marketing page (02-landing.md). No data requests; signed-in users are redirected by middleware. */
export default function LandingPage() {
  return (
    <PageContainer className="gap-16">
      <Suspense>
        <AccountDeletedToast />
      </Suspense>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <TrustSection />
      <CtaBand />
    </PageContainer>
  );
}
