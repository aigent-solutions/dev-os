import { beforeEach, describe, expect, it } from 'vitest';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';

// 07-document-viewer.md §12.
const s = () => useResultsViewerStore.getState();
beforeEach(() => s().reset());

describe('useResultsViewerStore', () => {
  it('goToPage increments scrollRequestId (re-selecting the same page scrolls again)', () => {
    s().goToPage(3, { termId: 't', text: 'x' });
    s().goToPage(3);
    expect(s()).toMatchObject({ targetPage: 3, scrollRequestId: 2, highlightTermId: null, highlightText: null });
  });
  it.each([
    [0.3, 0.5], [1.6, 1.5], [1.1, 1], [5, 2], [1.75, 1.75],
  ])('setZoom(%d) → %d (clamped to 0.5–2, 0.25 steps)', (z, out) => {
    s().setZoom(z);
    expect(s().zoom).toBe(out);
  });
});
