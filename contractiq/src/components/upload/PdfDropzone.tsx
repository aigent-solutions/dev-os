'use client';

import { FileUp } from 'lucide-react';
import { useId } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { MAX_FILE_BYTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export type DropzoneRejectCode = 'NOT_A_PDF' | 'FILE_TOO_LARGE' | 'TOO_MANY_FILES';

export type PdfDropzoneProps = {
  /** No type chosen, or step ≠ 'select'. */
  disabled: boolean;
  /** Shown under the zone while disabled for lack of a type. */
  disabledReason?: string;
  onFile: (file: File) => void;
  onReject: (code: DropzoneRejectCode) => void;
};

function rejectionCode(rejections: FileRejection[]): DropzoneRejectCode {
  const codes = rejections.flatMap((r) => r.errors.map((e) => e.code));
  if (codes.includes('too-many-files')) return 'TOO_MANY_FILES';
  if (codes.includes('file-too-large')) return 'FILE_TOO_LARGE';
  return 'NOT_A_PDF';
}

/** Drag-and-drop or browse for one PDF ≤ 10 MB (03 §8.3). */
export function PdfDropzone({ disabled, disabledReason, onFile, onReject }: PdfDropzoneProps) {
  const limitsId = useId();
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_BYTES,
    maxFiles: 1,
    multiple: false,
    disabled,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => files[0] && onFile(files[0]),
    onDropRejected: (rejections) => onReject(rejectionCode(rejections)),
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Outside the role="button" zone (no nested interactive control); the zone opens it via open(). */}
      <input {...getInputProps({ 'aria-label': 'Choose a contract PDF' })} />
      <div
        {...getRootProps({
          role: 'button',
          tabIndex: disabled ? -1 : 0,
          'aria-disabled': disabled || undefined,
          'aria-describedby': limitsId,
          'aria-label': 'Upload a contract PDF',
          onClick: () => !disabled && open(),
        })}
        // Outside getRootProps: with noKeyboard it drops every onKeyDown passed through it, ours included.
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            open();
          }
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-100 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          disabled
            ? 'cursor-not-allowed border-border bg-surface-page text-fg-disabled'
            : 'cursor-pointer border-border bg-surface text-fg-primary hover:border-brand hover:bg-brand-subtle',
          isDragActive && 'border-brand bg-brand-subtle',
        )}
      >
        <FileUp aria-hidden className={cn('h-6 w-6', disabled ? 'text-fg-disabled' : 'text-fg-secondary')} />
        <p className="text-body-lg">
          Drag and drop your PDF here, or <span className={cn(!disabled && 'text-fg-link underline underline-offset-2')}>browse</span>
        </p>
        <p id={limitsId} className="text-body-sm text-fg-secondary">
          PDF only · up to 10 MB · up to 20 pages
        </p>
      </div>
      {disabled && disabledReason && <p className="text-body-sm text-fg-secondary">{disabledReason}</p>}
      <p className="text-body-sm text-fg-secondary md:hidden">
        For the best experience with large PDFs, use a desktop browser (Chrome/Firefox).
      </p>
    </div>
  );
}
