import type { Metadata } from 'next';
import { ContractsTable } from '@/components/dashboard/ContractsTable';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardSummaryCards } from '@/components/dashboard/DashboardSummaryCards';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { RecentContractsList } from '@/components/dashboard/RecentContractsList';
import { OnboardingTooltips } from '@/components/onboarding/OnboardingTooltips';
import { PageContainer } from '@/components/ui/PageContainer';
import { flattenSearchParams } from '@/lib/api/parse';
import { createServerSupabase } from '@/lib/supabase/server';
import { ListContractsQuerySchema } from '@/lib/validation/contract';
import { listContracts } from '@/server/services/contracts.service';
import { getDashboardSummary } from '@/server/services/dashboard.service';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

// Dashboard (10 §6.5). Services are called directly; client components own refetching via the API.
export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createServerSupabase(); // (app)/layout already redirected signed-out users
  const parsed = ListContractsQuerySchema.safeParse(flattenSearchParams(searchParams));
  const query = parsed.success ? parsed.data : ListContractsQuerySchema.parse({}); // invalid params → defaults
  const [summary, list] = await Promise.all([getDashboardSummary(supabase), listContracts(supabase, query)]);

  return (
    <PageContainer className="gap-6">
      <DashboardHeader />
      <OnboardingTooltips page="dashboard" />
      {summary.total === 0 ? (
        <EmptyState />
      ) : (
        <>
          <DashboardSummaryCards initialData={summary} />
          <RecentContractsList initialData={summary.recent} />
          <ContractsTable initialQuery={query} initialData={list} />
        </>
      )}
    </PageContainer>
  );
}
