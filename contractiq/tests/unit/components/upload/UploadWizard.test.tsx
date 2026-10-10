import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadWizard } from '@/components/upload/UploadWizard';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';
import { renderWithClient } from '../../../helpers/render';

// 03-upload-extraction.md §12 — step transitions with the upload mutation mocked.
const mutate = vi.fn();
vi.mock('@/hooks/useUploadContract', () => ({ useUploadContract: () => ({ mutate, isPending: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => vi.clearAllMocks());

const set = (s: Partial<ReturnType<typeof useUploadWizardStore.getState>>) => act(() => useUploadWizardStore.setState(s));
const zone = () => screen.queryByRole('button', { name: 'Upload a contract PDF' });
const processButton = () => screen.getByRole('button', { name: /Process Contract/ });

describe('UploadWizard', () => {
  it('select: the dropzone is disabled until a contract type is chosen', () => {
    renderWithClient(<UploadWizard />);
    expect(zone()).toHaveAttribute('aria-disabled', 'true');
    set({ contractType: 'nda' });
    expect(zone()).not.toHaveAttribute('aria-disabled');
    expect(processButton()).toBeDisabled();
  });

  it('uploading → extracting → ready → processing', () => {
    renderWithClient(<UploadWizard />);
    const file = new File(['x'], 'Acme NDA.pdf', { type: 'application/pdf' });
    set({ contractType: 'nda', file, step: 'uploading' });
    expect(zone()).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Uploading Acme NDA.pdf' })).toBeInTheDocument();

    set({ step: 'extracting' });
    expect(screen.getByRole('progressbar', { name: 'Extracting text from Acme NDA.pdf' })).toBeInTheDocument();
    expect(processButton()).toBeDisabled();

    set({ step: 'ready', pageCount: 4, contractId: 'c-1' });
    expect(screen.getByText(/4 pages/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove file' })).toBeInTheDocument();
    expect(processButton()).toBeEnabled();

    set({ step: 'processing' });
    expect(screen.queryByRole('button', { name: 'Remove file' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Analysis progress' })).toBeInTheDocument();
  });

  it('an error shows a role="alert" banner and takes focus', () => {
    renderWithClient(<UploadWizard />);
    set({ contractType: 'nda', error: { code: 'SCANNED_PDF', message: 'This looks like a scanned PDF.' } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This looks like a scanned PDF.');
    expect(alert.parentElement).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
  });

  it('starts from a fresh store on mount', () => {
    useUploadWizardStore.setState({ contractType: 'msa', step: 'ready' });
    renderWithClient(<UploadWizard />);
    expect(useUploadWizardStore.getState()).toMatchObject({ contractType: null, step: 'select' });
  });
});
