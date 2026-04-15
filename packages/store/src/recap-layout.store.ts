import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecapPanelKind = 'recap' | 'dmNotes' | 'playerNotes';

// Mirrors react-mosaic-component's MosaicNode<RecapPanelKind> shape, declared
// here so the store doesn't take a runtime dep on the web-only mosaic library.
export type RecapMosaicNode =
  | RecapPanelKind
  | {
      direction: 'row' | 'column';
      first: RecapMosaicNode;
      second: RecapMosaicNode;
      splitPercentage?: number;
    };

// Default split: recap left (60%), DM notes top-right (60% of right column),
// player notes bottom-right (40% of right column). Honors "Recap & DM notes
// taller by default" from the rework spec.
export const DEFAULT_RECAP_LAYOUT: RecapMosaicNode = {
  direction: 'row',
  first: 'recap',
  second: {
    direction: 'column',
    first: 'dmNotes',
    second: 'playerNotes',
    splitPercentage: 60,
  },
  splitPercentage: 60,
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
    },
  ),
);
