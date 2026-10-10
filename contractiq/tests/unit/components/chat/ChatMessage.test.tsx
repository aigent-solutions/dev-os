import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { UiMessage } from '@/hooks/useChat';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';

// 09-contract-chat.md §12.
const base: UiMessage = {
  id: 'm', localId: 'm', role: 'assistant', content: '', cited_pages: [], is_not_found: false, citation_missing: false, status: 'complete', created_at: '2026-01-01T00:00:00Z',
};
const renderMsg = (over: Partial<UiMessage>, onRetry?: () => void) => render(<ul><ChatMessage message={{ ...base, ...over }} pageCount={5} onRetry={onRetry} /></ul>);

describe('ChatMessage', () => {
  it('valid [Page N] tokens become chips; out-of-range ones stay plain text', () => {
    renderMsg({ content: 'Based on the document, 30 days [Page 3] or [Page 9].', cited_pages: [3] });
    expect(screen.getAllByRole('button', { name: 'Go to page 3 in the document' })).toHaveLength(2); // inline + Source row
    expect(screen.queryByRole('button', { name: /page 9/ })).toBeNull();
    expect(screen.getByText(/\[Page 9\]/)).toBeInTheDocument();
  });

  it('a chip jumps the viewer to that page', async () => {
    const goToPage = vi.fn();
    useResultsViewerStore.setState({ goToPage });
    renderMsg({ content: 'x [Page 2]', cited_pages: [2] });
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Go to page 2 in the document' })[0]!);
    expect(goToPage).toHaveBeenCalledWith(2);
  });

  it('shows the "No page citation" warning when citation_missing', () => {
    renderMsg({ content: 'Based on the document, 30 days.', citation_missing: true });
    expect(screen.getByText('No page citation — verify in the document')).toBeInTheDocument();
  });

  it('an error shows the message and a Retry button', async () => {
    const onRetry = vi.fn();
    renderMsg({ content: 'Half an ans', status: 'error', errorMessage: 'Response interrupted.', retryable: true }, onRetry);
    expect(screen.getByText('Response interrupted.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('a non-retryable error has no Retry button', () => {
    renderMsg({ status: 'error', errorMessage: 'Too many questions.', retryable: false }, vi.fn());
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('renders model output as plain text — no HTML injection', () => {
    const { container } = renderMsg({ content: '<script>window.__pwned = 1</script><img src=x onerror="alert(1)"> **bold**' });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>window.__pwned = 1<\/script>/)).toBeInTheDocument();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('user messages are plain text too', () => {
    const { container } = renderMsg({ role: 'user', content: '<b>hi</b>' });
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>hi</b>')).toBeInTheDocument();
  });
});
