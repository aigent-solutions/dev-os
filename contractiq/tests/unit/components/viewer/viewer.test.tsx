import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewer } from '@/components/viewer/DocumentViewer';
import { PageIndicator } from '@/components/viewer/PageIndicator';
import { TextViewer } from '@/components/viewer/TextViewer';
import { ZoomControls } from '@/components/viewer/ZoomControls';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';

// 07-document-viewer.md §12 — components with pdf.js replaced (it needs canvas).
vi.mock('@/components/viewer/PdfViewer', () => ({
  default: ({ onFatalError }: { onFatalError: () => void }) => (
    <div data-testid="pdf">
      <button type="button" onClick={onFatalError}>simulate pdf failure</button>
    </div>
  ),
}));

beforeAll(() => {
  // jsdom has neither observer; report a real width so the viewer is "ready".
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: 800 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
  Element.prototype.scrollTo = () => undefined;
});
beforeEach(() => useResultsViewerStore.getState().reset());

const TEXT = '[PAGE 1]\nPreamble text here.\n[PAGE 2]\nThis Agreement is governed by the laws of England and Wales.\n[PAGE 3]\nSignatures.';

describe('TextViewer', () => {
  const renderText = () => render(<TextViewer contractText={TEXT} pageCount={3} onCurrentPageChange={vi.fn()} announce={vi.fn()} />);

  it('renders one section per [PAGE N] marker and never shows the markers', () => {
    const { container } = renderText();
    expect(container.querySelectorAll('[data-page]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\[PAGE \d+\]/);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('a matching sentence is wrapped in <mark>', async () => {
    const { container } = renderText();
    act(() => useResultsViewerStore.getState().goToPage(2, { termId: 't', text: 'This Agreement is governed by the laws of England and Wales.' }));
    await waitFor(() => expect(container.querySelector('mark')).toHaveTextContent('This Agreement is governed by the laws of England and Wales.'));
  });

  it('no match → the page itself is highlighted (data-highlighted="page")', async () => {
    const { container } = renderText();
    act(() => useResultsViewerStore.getState().goToPage(3, { termId: 't', text: 'A sentence that is nowhere in this contract at all.' }));
    await waitFor(() => expect(container.querySelector('[data-page="3"]')).toHaveAttribute('data-highlighted', 'page'));
    expect(container.querySelector('mark')).toBeNull();
  });
});

describe('DocumentViewer', () => {
  const props = { contractId: 'c', fileName: 'Acme NDA.pdf', pageCount: 3, contractText: TEXT, pdfUrlExpiresAt: null };

  it('pdfUrl = null → text mode with the "no longer stored" notice; no PDF toggle', () => {
    render(<DocumentViewer {...props} pdfUrl={null} />);
    expect(screen.getByText(/The original PDF is no longer stored/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View PDF' })).toBeNull();
  });

  it('a fatal PDF error → text mode, the failure notice, a download link; the toggle is gone', async () => {
    render(<DocumentViewer {...props} pdfUrl="https://x.test/signed.pdf?token=1" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'simulate pdf failure' }));
    expect(screen.getByText(/couldn't display the PDF here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View PDF' })).toBeNull();
    expect(screen.queryByTestId('pdf')).toBeNull();
  });
});

describe('ZoomControls', () => {
  it.each([[0.5, true, false], [1, false, false], [2, false, true]])('zoom %d: out disabled %s, in disabled %s', (zoom, outDisabled, inDisabled) => {
    render(<ZoomControls zoom={zoom} onZoom={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(outDisabled);
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(inDisabled);
  });
  it('the reset button shows the current zoom and resets to 100%', async () => {
    const onZoom = vi.fn();
    render(<ZoomControls zoom={1.5} onZoom={onZoom} />);
    const reset = screen.getByRole('button', { name: 'Reset zoom to 100%' });
    expect(reset).toHaveTextContent('150%');
    await userEvent.setup().click(reset);
    expect(onZoom).toHaveBeenCalledWith(1);
  });
});

describe('PageIndicator', () => {
  it('previous is disabled on page 1; next on the last page', () => {
    const { rerender } = render(<PageIndicator current={1} total={3} announcement="" onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    rerender(<PageIndicator current={3} total={3} announcement="" onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
  it('the aria-live region carries the announcement', () => {
    const { container, rerender } = render(<PageIndicator current={1} total={3} announcement="" onPrev={vi.fn()} onNext={vi.fn()} />);
    rerender(<PageIndicator current={2} total={3} announcement="Showing page 2" onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Showing page 2');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });
});
