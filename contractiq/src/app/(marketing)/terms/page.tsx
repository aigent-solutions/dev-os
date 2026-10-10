import type { Metadata } from 'next';
import { PageContainer } from '@/components/ui/PageContainer';

export const dynamic = 'force-static';

// Placeholder until the legal review (02 §6, a PRD dependency before v1.0). Not indexed.
export const metadata: Metadata = { title: 'Terms of Service', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <PageContainer>
      <h1 className="text-h5 text-fg-primary">Terms of Service</h1>
      <p className="text-body-lg font-normal text-fg-secondary">This page will be published before public launch.</p>
    </PageContainer>
  );
}
