import { ResultsSkeleton } from '@/components/contracts/ResultsSkeleton';

export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 md:px-6">
      <ResultsSkeleton />
    </div>
  );
}
