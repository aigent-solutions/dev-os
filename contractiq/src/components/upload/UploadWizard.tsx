'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { OnboardingTooltips } from '@/components/onboarding/OnboardingTooltips';
import { Card } from '@/components/ui/Card';
import { useUploadContract } from '@/hooks/useUploadContract';
import { apiFetch } from '@/lib/api-client';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';
import type { ContractType } from '@/types/domain';
import { ContractTypeSelect } from './ContractTypeSelect';
import { PdfDropzone, type DropzoneRejectCode } from './PdfDropzone';
import { ProcessContractButton } from './ProcessContractButton';
import { ProcessingSteps } from './ProcessingSteps';
import { TermPreviewCard } from './TermPreviewCard';
import { UploadProgress } from './UploadProgress';

const REJECT_MESSAGES: Record<DropzoneRejectCode, string> = {
  NOT_A_PDF: 'Please upload a PDF under 10 MB.',
  FILE_TOO_LARGE: 'Please upload a PDF under 10 MB.',
  TOO_MANY_FILES: 'Please upload one PDF at a time.',
};

/** Step 3 is shown after 12 s of a sync request, which has no polling (05 §7). */
function useProcessingStep(step: string): 2 | 3 {
  const [current, setCurrent] = useState<2 | 3>(2);
  useEffect(() => {
    if (step !== 'processing') {
      setCurrent(2);
      return;
    }
    const t = setTimeout(() => setCurrent(3), 12_000);
    return () => clearTimeout(t);
  }, [step]);
  return current;
}

/** /contracts/new: type → upload → extract → custom terms → Process (03 §8.1). */
export function UploadWizard() {
  const s = useUploadWizardStore();
  const upload = useUploadContract();
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const processingStep = useProcessingStep(s.step);
  const errorRef = useRef<HTMLDivElement>(null);

  // Fresh wizard on mount; reset on unmount (after navigating to /contracts/{id}).
  useEffect(() => {
    useUploadWizardStore.getState().reset();
    return () => useUploadWizardStore.getState().reset();
  }, []);

  useEffect(() => {
    if (s.error) errorRef.current?.focus();
  }, [s.error]);

  const onType = (t: ContractType) => {
    const removed = s.setContractType(t);
    setNotice(
      removed.length
        ? removed.map((n) => `'${n}' is already a standard term for ${t.toUpperCase()} and was removed from your custom terms.`).join(' ')
        : null,
    );
  };

  const onFile = (file: File) => {
    if (!s.contractType || s.step !== 'select') return;
    s.setError(null);
    s.setFile(file);
    upload.mutate({ file, contractType: s.contractType });
  };

  const onRemoveFile = async () => {
    if (!s.contractId) return;
    setRemoving(true);
    await apiFetch(`/api/contracts/${s.contractId}`, { method: 'DELETE' }).catch(() => undefined);
    setRemoving(false);
    s.resetFile();
  };

  const busy = s.step === 'uploading' || s.step === 'extracting';
  const stepNumber: 1 | 2 | 3 = busy ? 1 : s.step === 'processing' ? processingStep : 1;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card as="section" padding="lg" aria-labelledby="upload-heading" className="flex flex-col gap-6">
        <h2 id="upload-heading" className="text-h5 text-fg-primary">
          Your contract
        </h2>

        <ContractTypeSelect value={s.contractType} onChange={onType} disabled={s.step !== 'select'} />

        {s.error && (
          <div ref={errorRef} tabIndex={-1} className="rounded-md focus:outline-none">
            <Banner
              tone="danger"
              action={
                <Button variant="secondary" size="sm" onClick={() => s.setError(null)}>
                  Choose another file
                </Button>
              }
            >
              {s.error.message}
            </Banner>
          </div>
        )}

        {s.step === 'select' && (
          <PdfDropzone
            disabled={!s.contractType}
            disabledReason={!s.contractType ? 'Choose a contract type first.' : undefined}
            onFile={onFile}
            onReject={(code) => s.setError({ code, message: REJECT_MESSAGES[code] })}
          />
        )}

        {busy && s.file && <UploadProgress phase={s.step === 'uploading' ? 'uploading' : 'extracting'} fileName={s.file.name} fileSize={s.file.size} />}

        {(s.step === 'ready' || s.step === 'processing') && s.file && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-body-lg text-fg-primary">
              <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success-fg" />
              <span className="sr-only">Ready:</span>
              {s.file.name}
              <span className="text-body-sm text-fg-secondary">· {s.pageCount} pages</span>
            </p>
            {s.step === 'ready' && (
              <Button variant="ghost" size="sm" onClick={onRemoveFile} loading={removing}>
                Remove file
              </Button>
            )}
          </div>
        )}

        {s.step !== 'select' && <ProcessingSteps current={stepNumber} />}

        <ProcessContractButton contractId={s.contractId} disabled={s.step !== 'ready'} />
      </Card>

      <TermPreviewCard
        contractType={s.contractType}
        customTerms={s.customTerms}
        onAdd={s.addCustomTerm}
        onRemove={s.removeCustomTerm}
        locked={s.step === 'processing'}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />
      {/* U1 waits until a type is chosen and the term preview shows (14 §2.1). */}
      {s.contractType && <OnboardingTooltips page="upload" />}
    </div>
  );
}
