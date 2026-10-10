import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DangerZoneCard } from '@/components/settings/DangerZoneCard';
import { DataSharingToggle } from '@/components/settings/DataSharingToggle';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { PageContainer } from '@/components/ui/PageContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { createServerSupabase } from '@/lib/supabase/server';
import { getProfile } from '@/server/services/account.service';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

// Settings (13 §8.1): profile, data-sharing consent, account deletion.
export default async function SettingsPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // (app)/layout already redirects; this narrows the type
  const profile = await getProfile(supabase, user.id);

  return (
    <PageContainer className="gap-6">
      <SectionHeader as="h1" title="Settings" />
      <ProfileSection initialProfile={profile} />
      <DataSharingToggle initialProfile={profile} />
      <DangerZoneCard />
    </PageContainer>
  );
}
