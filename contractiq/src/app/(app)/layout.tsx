import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider';
import { logger } from '@/lib/logger';
import { createServerSupabase } from '@/lib/supabase/server';

// Signed-in area (01-auth.md §6.4). Middleware already redirects signed-out users; this is defence in depth.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  // Only possible if the handle_new_user trigger failed. Render normally; no onboarding tips.
  if (!profile) logger.warn('profile_missing', { user_id: user.id });

  // Onboarding tips (14 §7.1). A missing profile counts as completed: no tips.
  return (
    <AppShell email={user.email ?? profile?.email ?? ''}>
      <OnboardingProvider completed={!profile || profile.onboarding_completed_at !== null}>{children}</OnboardingProvider>
    </AppShell>
  );
}
