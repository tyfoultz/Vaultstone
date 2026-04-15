import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecapPanelKind = 'recap' | 'dmNotes' | 'playerNotes';

// Mirrors react-mosaic-component v7's MosaicNode<RecapPanelKind> n-ary shape,
// declared here so the store doesn't take a runtime dep on the web-only
// mosaic library.
export interface RecapMosaicSplit {
  type: 'split';
  direction: 'row' | 'column';
  children: RecapMosaicNode[];
  splitPercentages?: number[];
}

export interface RecapMosaicTabs {
  type: 'tabs';
  tabs: RecapPanelKind[];
  activeTabIndex: number;
}

export type RecapMosaicNode = RecapPanelKind | RecapMosaicSplit | RecapMosaicTabs;

// Default split: recap left (60%), DM notes top-right (60% of right column),
// player notes bottom-right (40% of right column). Honors "Recap & DM notes
// taller by default" from the rework spec.
export const DEFAULT_RECAP_LAYOUT: RecapMosaicNode = {
  type: 'split',
  direction: 'row',
  children: [
    'recap',
    {
      type: 'split',
      direction: 'column',
      children: ['dmNotes', 'playerNotes'],
      splitPercentages: [60, 40],
    },
  ],
  splitPercentages: [60, 40],
};

export interface RecapLayoutState {
  layout: RecapMosaicNode;
  sidebarCollapsed: boolean;
  setLayout: (next: RecapMosaicNode) => void;
  resetLayout: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useRecapLayoutStore = create<RecapLayoutState>()(
  persist(
    (set) => ({
      layout: DEFAULT_RECAP_LAYOUT,
      sidebarCollapsed: false,
      setLayout: (next) => set({ layout: next }),
      resetLayout: () => set({ layout: DEFAULT_RECAP_LAYOUT }),
      toggleSidebar: () => set((prev) => ({ sidebarCollapsed: !prev.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'vaultstone-recap-layout',
      storage: createJSONStorage(() => AsyncStorage),
      // v2: switched from mosaic v6 binary-tree layout to v7 n-ary shape.
      // Older persisted layouts had {direction, first, second} parents; reset
      // to default rather than try to convert.
      version: 2,
      migrate: (_persisted, _version) =>
        ({ layout: DEFAULT_RECAP_LAYOUT, sidebarCollapsed: false } as RecapLayoutState),
    },
  ),
);
