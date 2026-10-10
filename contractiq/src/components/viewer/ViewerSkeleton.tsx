import { Skeleton } from '@/components/ui/Skeleton';

/** Two page-shaped blocks while the PDF loads (07 §8.9). */
export function ViewerSkeleton() {
  return (
    <div aria-busy="true" role="status" aria-label="Loading document" className="flex flex-col items-center gap-4 p-4">
      <Skeleton className="h-96 w-full max-w-prose" />
      <Skeleton className="h-96 w-full max-w-prose" />
    </div>
  );
}
