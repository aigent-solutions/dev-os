import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TermPreviewCard } from '@/components/upload/TermPreviewCard';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { useUploadWizardStore } from '@/stores/useUploadWizardStore';
import { renderWithClient } from '../../../helpers/render';

// 04-term-preview-custom-terms.md §12.
const props = { customTerms: [] as string[], onAdd: vi.fn(() => ({ ok: true })), onRemove: vi.fn(), locked: false, notice: null, onDismissNotice: vi.fn() };
const items = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('TermPreviewCard', () => {
  it('prompts for a type when none is chosen', () => {
    renderWithClient(<TermPreviewCard {...props} contractType={null} />);
    expect(screen.getByText(/Choose a contract type/)).toBeInTheDocument();
  });

  it('swaps the list on type change', () => {
    const { rerender } = renderWithClient(<TermPreviewCard {...props} contractType="nda" />);
    expect(items()).toHaveLength(TERM_LIBRARY.nda.length);
    expect(screen.getByText('Breach & Remedy')).toBeInTheDocument();
    rerender(<TermPreviewCard {...props} contractType="msa" />);
    expect(items()).toHaveLength(TERM_LIBRARY.msa.length);
    expect(screen.queryByText('Breach & Remedy')).toBeNull();
    expect(screen.getByText('Liability Cap')).toBeInTheDocument();
  });

  it('lists custom terms after the standard ones with a Custom badge and the notice', () => {
    renderWithClient(<TermPreviewCard {...props} contractType="nda" customTerms={['Audit rights']} notice="'Notice Period' was removed." />);
    expect(items().at(-1)).toContain('Audit rights');
    expect(items().at(-1)).toContain('Custom');
    expect(screen.getByText("'Notice Period' was removed.")).toBeInTheDocument();
  });
});

describe('useUploadWizardStore.setContractType', () => {
  it('removes custom terms that clash with the new type and returns them', () => {
    act(() => {
      useUploadWizardStore.getState().reset();
      useUploadWizardStore.getState().setContractType('nda');
      expect(useUploadWizardStore.getState().addCustomTerm('Notice Period')).toEqual({ ok: true });
      expect(useUploadWizardStore.getState().addCustomTerm('Audit rights')).toEqual({ ok: true });
    });
    let removed: string[] = [];
    act(() => {
      removed = useUploadWizardStore.getState().setContractType('msa');
    });
    expect(removed).toEqual(['Notice Period']);
    expect(useUploadWizardStore.getState().customTerms).toEqual(['Audit rights']);
  });
});
