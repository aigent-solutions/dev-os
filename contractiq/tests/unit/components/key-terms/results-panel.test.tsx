import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeMismatchBanner } from '@/components/contracts/TypeMismatchBanner';
import { ConfidenceBadge } from '@/components/key-terms/ConfidenceBadge';
import { KeyTermRow } from '@/components/key-terms/KeyTermRow';
import { KeyTermsPanel } from '@/components/key-terms/KeyTermsPanel';
import { LowConfidenceWarning } from '@/components/key-terms/LowConfidenceWarning';
import { SourceSentenceDisclosure } from '@/components/key-terms/SourceSentenceDisclosure';
import { LOW_CONFIDENCE_TOOLTIP } from '@/lib/constants';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import { keyTerm } from '../../../helpers/fixtures';
import { renderWithClient } from '../../../helpers/render';

// 06-results-key-terms-panel.md §12.
beforeEach(() => useResultsViewerStore.getState().reset());

describe('ConfidenceBadge', () => {
  it.each([
    [92, 'Confidence 92%, High'],
    [65, 'Confidence 65%, Medium'],
    [35, 'Confidence 35%, Low'],
  ])('%i%% → "%s", with the % text and an icon (colour is never the only signal)', (score, label) => {
    const { container } = renderWithClient(<ConfidenceBadge score={score} />);
    expect(screen.getByRole('button', { name: label })).toHaveTextContent(`${score}%`);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('LowConfidenceWarning', () => {
  it('has no dismiss control, and the tooltip text is always in the DOM via aria-describedby', () => {
    renderWithClient(<LowConfidenceWarning termName="Liability Cap" />);
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).toBeNull();
    const button = screen.getByRole('button', { name: /Low confidence for Liability Cap/ });
    expect(document.getElementById(button.getAttribute('aria-describedby')!)).toHaveTextContent(LOW_CONFIDENCE_TOOLTIP);
  });

  it('KeyTermRow shows it at 49 but not at 50', () => {
    const { unmount } = renderWithClient(<ul><KeyTermRow term={keyTerm({ confidence_score: 49 })} contractId="c" contractType="nda" pageCount={3} isSelected={false} onSelect={vi.fn()} /></ul>);
    expect(screen.getByRole('button', { name: /Low confidence/ })).toBeInTheDocument();
    unmount();
    renderWithClient(<ul><KeyTermRow term={keyTerm({ confidence_score: 50 })} contractId="c" contractType="nda" pageCount={3} isSelected={false} onSelect={vi.fn()} /></ul>);
    expect(screen.queryByRole('button', { name: /Low confidence/ })).toBeNull();
  });
});

describe('KeyTermRow', () => {
  const row = (over = {}, onSelect = vi.fn()) => {
    renderWithClient(<ul><KeyTermRow term={keyTerm(over)} contractId="c" contractType="nda" pageCount={3} isSelected={false} onSelect={onSelect} /></ul>);
    return onSelect;
  };

  it('a null value reads "Not found in document"', () => {
    row({ value: null, page_number: null });
    expect(screen.getByText('Not found in document')).toBeInTheDocument();
  });

  it('clicking the term name selects it; clicking the value editor does not', async () => {
    const onSelect = row();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show Governing Law in the document' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Edit Governing Law value' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a standard term has a jargon ⓘ; a custom term has the Custom badge instead', () => {
    row();
    expect(screen.getByRole('button', { name: 'What is Governing Law?' })).toBeInTheDocument();
  });

  it('a custom term: Custom badge, no standard-term ⓘ', () => {
    row({ is_custom: true, term_key: 'custom_audit_rights', term_name: 'Audit rights' });
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'What is Audit rights?' })).toBeNull();
  });
});

describe('SourceSentenceDisclosure', () => {
  it('collapsed by default; expanding shows the quote', async () => {
    renderWithClient(<SourceSentenceDisclosure sourceSentence="The law of England applies." sourceVerified termName="Governing Law" />);
    expect(screen.queryByText(/The law of England applies/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /Why\?/ }));
    expect(screen.getByText(/The law of England applies/)).toBeInTheDocument();
    expect(screen.queryByText('Source not verified')).toBeNull();
  });

  it('an unverified source shows the badge', async () => {
    renderWithClient(<SourceSentenceDisclosure sourceSentence="Made up." sourceVerified={false} termName="x" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Why\?/ }));
    expect(screen.getByText('Source not verified')).toBeInTheDocument();
  });

  it('a null sentence explains that nothing was found', async () => {
    renderWithClient(<SourceSentenceDisclosure sourceSentence={null} sourceVerified={false} termName="x" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Why\?/ }));
    expect(screen.getByText('No supporting sentence was found in the document.')).toBeInTheDocument();
  });
});

describe('KeyTermsPanel', () => {
  it('sorts by display_order (never by confidence)', () => {
    const terms = [
      keyTerm({ id: 'b', term_name: 'Second', display_order: 2, confidence_score: 99 }),
      keyTerm({ id: 'a', term_name: 'First', display_order: 1, confidence_score: 10 }),
    ];
    renderWithClient(<KeyTermsPanel contractId="c" contractType="nda" pageCount={3} terms={terms} />);
    const names = screen.getAllByRole('button', { name: /^Show .* in the document$/ }).map((b) => b.textContent);
    expect(names).toEqual(['First', 'Second']);
  });

  it('selecting a term with a page calls goToPage; with no page it announces instead', async () => {
    const goToPage = vi.fn();
    useResultsViewerStore.setState({ goToPage });
    const terms = [keyTerm({ id: 'a', term_name: 'Paged', page_number: 2, display_order: 1 }), keyTerm({ id: 'b', term_name: 'Missing', value: null, page_number: null, display_order: 2 })];
    renderWithClient(<KeyTermsPanel contractId="c" contractType="nda" pageCount={3} terms={terms} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show Paged in the document' }));
    expect(goToPage).toHaveBeenCalledWith(2, expect.objectContaining({ termId: 'a' }));
    goToPage.mockClear();
    await user.click(screen.getByRole('button', { name: 'Show Missing in the document' }));
    expect(goToPage).not.toHaveBeenCalled();
    expect(await screen.findByText('This term was not found in the document')).toBeInTheDocument();
  });
});

describe('TypeMismatchBanner', () => {
  it('detected a different type', () => {
    renderWithClient(<TypeMismatchBanner selected="nda" detected="msa" />);
    expect(screen.getByText(/This looks like an MSA rather than an NDA/)).toBeInTheDocument();
  });
  it('detected "other"', () => {
    renderWithClient(<TypeMismatchBanner selected="msa" detected="other" />);
    expect(screen.getByText(/This doesn't look like an MSA/)).toBeInTheDocument();
  });
  it('hidden when the types match', () => {
    const { container } = renderWithClient(<TypeMismatchBanner selected="nda" detected="nda" />);
    expect(container).toBeEmptyDOMElement();
  });
});
