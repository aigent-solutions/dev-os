import { Skeleton } from '@/components/ui/Skeleton';

/** Route loading state: header bar, 60/40 panels, 6 term rows (06 §6.3). */
export function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading contract" className="flex flex-col gap-6">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Skeleton className="hidden h-96 lg:col-span-3 lg:block" />
        <div className="flex flex-col gap-2 lg:col-span-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
