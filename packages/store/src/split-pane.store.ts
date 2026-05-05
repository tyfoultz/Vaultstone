import { create } from 'zustand';

interface SplitPaneState {
  splitPageId: string | null;
  splitRatio: number;
  focusedPane: 'primary' | 'split';
  openSplit: (pageId: string) => void;
  closeSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedPane: (pane: 'primary' | 'split') => void;
}

export const useSplitPaneStore = create<SplitPaneState>((set) => ({
  splitPageId: null,
  splitRatio: 0.5,
  focusedPane: 'split',
  openSplit: (pageId) =>
    set({ splitPageId: pageId, splitRatio: 0.5, focusedPane: 'split' }),
  closeSplit: () =>
    set({ splitPageId: null, splitRatio: 0.5, focusedPane: 'primary' }),
  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
  setFocusedPane: (pane) => set({ focusedPane: pane }),
}));
