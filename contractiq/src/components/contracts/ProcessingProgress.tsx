import { Card } from '@/components/ui/Card';
import { ProcessingSteps } from '@/components/upload/ProcessingSteps';
import type { ProcessingStage } from '@/types/domain';

export type ProcessingProgressProps = { fileName: string; stage: ProcessingStage | null; elapsedMs: number | null };

/** Results-page progress while status = processing (05 §8.3). Polling lives in ContractView. */
export function ProcessingProgress({ fileName, stage, elapsedMs }: ProcessingProgressProps) {
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-6" aria-labelledby="progress-heading">
      <div className="flex flex-col gap-0.5">
        <h2 id="progress-heading" className="text-h5 text-fg-primary">
          Analysing {fileName}
        </h2>
        <p className="text-body-sm text-fg-secondary">This usually takes under 30 seconds.</p>
      </div>
      <ProcessingSteps current={stage === 'compiling' ? 3 : 2} />
      {(elapsedMs ?? 0) > 45_000 && (
        <p className="text-body-sm text-fg-secondary" aria-live="polite">
          Still working — longer contracts can take a little more time.
        </p>
      )}
      <p className="text-body-sm text-fg-secondary">You can leave this page — the analysis keeps running.</p>
    </Card>
  );
}
