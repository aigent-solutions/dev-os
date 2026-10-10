import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultsLayout } from '@/components/contracts/ResultsLayout';
import { contractDetail } from '../../../helpers/fixtures';
import { renderWithClient } from '../../../helpers/render';
import { mockViewport } from '../../../helpers/viewport';

// 06-results-key-terms-panel.md §12 — the layout switches on viewport width.
vi.mock('@/components/viewer/DocumentViewer', () => ({ DocumentViewer: () => <div data-testid="viewer" /> })); // pdf.js needs canvas
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn(async () => ({ session_id: null, messages: [] })) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const desktop = () => document.querySelector('[data-panel-group]');
const mobileBanner = () => screen.queryByText(/use a desktop browser/);

describe('ResultsLayout', () => {
  it('1200 px: resizable split, no tab list for the document', async () => {
    mockViewport(1200);
    renderWithClient(<ResultsLayout detail={contractDetail()} />);
    await waitFor(() => expect(desktop()).not.toBeNull());
    expect(screen.queryByRole('tab', { name: 'Document' })).toBeNull();
    expect(mobileBanner()).toBeNull();
  });

  it('900 px: tabs (Document | Key Terms | Chat), no split, no mobile banner', async () => {
    mockViewport(900);
    renderWithClient(<ResultsLayout detail={contractDetail()} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Document' })).toBeInTheDocument());
    expect(desktop()).toBeNull();
    expect(mobileBanner()).toBeNull();
  });

  it('375 px: tabs and the mobile banner', async () => {
    mockViewport(375);
    renderWithClient(<ResultsLayout detail={contractDetail()} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Document' })).toBeInTheDocument());
    await waitFor(() => expect(mobileBanner()).not.toBeNull());
  });

  it('always shows the legal disclaimer, and the type-mismatch banner when flagged', async () => {
    mockViewport(1200);
    renderWithClient(<ResultsLayout detail={contractDetail({ type_mismatch: true, detected_contract_type: 'msa' })} />);
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(screen.getByText(/This looks like an MSA rather than an NDA/)).toBeInTheDocument();
  });
});
