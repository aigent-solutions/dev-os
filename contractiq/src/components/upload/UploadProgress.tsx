import { cn } from '@/lib/utils';

export type UploadProgressProps = { phase: 'uploading' | 'extracting'; fileName: string; fileSize: number };

/** Indeterminate bar: supabase-js upload() has no progress callback (03 §7, §8.4). */
export function UploadProgress({ phase, fileName, fileSize }: UploadProgressProps) {
  const label = phase === 'uploading' ? `Uploading ${(fileSize / (1024 * 1024)).toFixed(1)} MB…` : 'Reading your contract…';
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <p className="text-body-sm text-fg-secondary">{label}</p>
      <div
        role="progressbar"
        aria-label={phase === 'uploading' ? `Uploading ${fileName}` : `Extracting text from ${fileName}`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
      >
        <div className={cn('absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand animate-indeterminate', 'motion-reduce:animate-none')} />
      </div>
    </div>
  );
}
