import { PageContainer } from '@/components/ui/PageContainer';
import { Skeleton } from '@/components/ui/Skeleton';

/** Dashboard skeleton: header, 3 summary cards, recent list, table rows (10 §6.1). */
export default function DashboardLoading() {
  return (
    <PageContainer className="gap-6">
      <div aria-busy="true" aria-label="Loading your contracts" className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-56" />
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
