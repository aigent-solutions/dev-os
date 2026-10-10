import type { Metadata } from 'next';
import { MobileDeviceBanner } from '@/components/layout/MobileDeviceBanner';
import { UploadWizard } from '@/components/upload/UploadWizard';
import { PageContainer } from '@/components/ui/PageContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Review a Contract' };

export default function NewContractPage() {
  return (
    <PageContainer>
      <SectionHeader
        as="h1"
        title="Review a Contract"
        description="Choose the contract type, upload a text-based PDF, and add any extra terms you want us to find."
      />
      <MobileDeviceBanner />
      <UploadWizard />
    </PageContainer>
  );
}
