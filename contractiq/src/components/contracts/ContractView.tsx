'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { MobileDeviceBanner } from '@/components/layout/MobileDeviceBanner';
import { toast } from '@/components/ui/Toast';
import { useContract } from '@/hooks/useContract';
import { useContractStatus } from '@/hooks/useContractStatus';
import { ApiClientError } from '@/lib/api-client';
import { CONTRACT_ERROR_MESSAGE } from '@/lib/api/error-catalog';
import { qk } from '@/lib/query-keys';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import type { ContractDetail } from '@/types/api';
import { ProcessingError } from './ProcessingError';
import { ProcessingProgress } from './ProcessingProgress';
import { ResultsLayout } from './ResultsLayout';
import { NotAnalysedCard, UploadIncompleteCard } from './StatusCards';

/** /contracts/[id]: switches on status (06 §8.2). */
export function ContractView({ contractId, initialData }: { contractId: string; initialData: ContractDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error } = useContract(contractId, initialData);
  const detail = data ?? initialData;
  const { contract } = detail;

  // Fresh viewer state per contract.
  useEffect(() => {
    useResultsViewerStore.getState().reset();
    return () => useResultsViewerStore.getState().reset();
  }, [contractId]);

  // Deleted in another tab → back to the dashboard.
  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 404) {
      toast({ title: 'That contract no longer exists.', tone: 'neutral' });
      router.replace('/dashboard');
    }
  }, [error, router]);

  // While processing, poll the light status endpoint; on a final status, reload the full detail.
  const { data: status } = useContractStatus(contractId, { enabled: contract.status === 'processing' });
  const wasProcessing = useRef(contract.status === 'processing');
  useEffect(() => {
    if (!status) return;
    if (wasProcessing.current && status.status !== 'processing') {
      void qc.invalidateQueries({ queryKey: qk.contract(contractId) });
      void qc.invalidateQueries({ queryKey: qk.dashboardSummary() });
    }
    wasProcessing.current = status.status === 'processing';
  }, [status, qc, contractId]);

  const customTerms = detail.custom_terms.map((t) => t.term_name);
  // Non-results states: page title, then the mobile tip (14 §2.3). The results layout renders its own after the banners.
  const title = (
    <>
      <h1 className="truncate text-h5 text-fg-primary" title={contract.file_name}>{contract.file_name}</h1>
      <MobileDeviceBanner />
    </>
  );

  switch (contract.status) {
    case 'pending_upload':
      return <div className="flex flex-col gap-6">{title}<UploadIncompleteCard /></div>;
    case 'ready':
      return <div className="flex flex-col gap-6">{title}<NotAnalysedCard contractId={contractId} customTerms={customTerms} /></div>;
    case 'processing': {
      const live = status?.status === 'processing' ? status : null;
      if (status?.status === 'error') {
        return (
          <div className="flex flex-col gap-6">
            {title}
            <ProcessingError contractId={contractId} error={status.error ?? { code: 'INTERNAL_ERROR', message: CONTRACT_ERROR_MESSAGE }} attempts={contract.processing_attempts} customTerms={customTerms} />
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-6">
          {title}
          <ProcessingProgress fileName={contract.file_name} stage={live?.processing_stage ?? contract.processing_stage} elapsedMs={live?.elapsed_ms ?? null} />
        </div>
      );
    }
    case 'error':
      return (
        <div className="flex flex-col gap-6">
          {title}
          <ProcessingError contractId={contractId} error={contract.error ?? { code: 'INTERNAL_ERROR', message: CONTRACT_ERROR_MESSAGE }} attempts={contract.processing_attempts} customTerms={customTerms} />
        </div>
      );
    case 'completed':
      return <ResultsLayout detail={detail} />;
  }
}
