'use client';

import { create } from 'zustand';

// Results page UI state (README §3.10). Shared by the key terms panel, the document viewer (07) and
// chat citations (09). ContractView resets it on mount and unmount so nothing leaks between contracts.
type State = {
  targetPage: number | null;
  /** Bumped on every goToPage so re-selecting the same page scrolls again. */
  scrollRequestId: number;
  highlightTermId: string | null;
  highlightText: string | null;
  zoom: number; // 0.5 – 2.0, step 0.25
  viewerMode: 'pdf' | 'text';
  activeTab: 'terms' | 'chat';
};

type Actions = {
  goToPage(page: number, opts?: { termId?: string; text?: string | null }): void;
  setZoom(z: number): void;
  setViewerMode(m: 'pdf' | 'text'): void;
  setActiveTab(t: 'terms' | 'chat'): void;
  reset(): void;
};

const initial: State = {
  targetPage: null,
  scrollRequestId: 0,
  highlightTermId: null,
  highlightText: null,
  zoom: 1,
  viewerMode: 'pdf',
  activeTab: 'terms',
};

export const useResultsViewerStore = create<State & Actions>()((set) => ({
  ...initial,
  goToPage: (page, opts) =>
    set((s) => ({
      targetPage: page,
      scrollRequestId: s.scrollRequestId + 1,
      highlightTermId: opts?.termId ?? null,
      highlightText: opts?.text ?? null,
    })),
  setZoom: (z) => set({ zoom: Math.min(2, Math.max(0.5, Math.round(z * 4) / 4)) }),
  setViewerMode: (viewerMode) => set({ viewerMode }),
  setActiveTab: (activeTab) => set({ activeTab }),
  reset: () => set(initial),
}));
