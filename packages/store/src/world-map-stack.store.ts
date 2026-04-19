import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Sub-map drill-down stack. Each frame captures the viewport the user
// left behind when they drilled down so we can restore it on back.
//
// Persistence rule: only the top-of-stack viewport per mapId is persisted
// (so a cold start to `/map/:mapId` restores the last pan/zoom). Mid-drill
// stack state is session-only — drilling has to happen intentionally.
export interface MapStackViewport {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface MapStackEntry {
  mapId: string;
  viewport: MapStackViewport;
  breadcrumbLabel: string;
}

interface WorldMapStackState {
  stack: MapStackEntry[];
  viewportByMapId: Record<string, MapStackViewport>;
  reset: (entry: MapStackEntry) => void;
  push: (entry: MapStackEntry) => void;
  pop: () => void;
  popTo: (depth: number) => void;
  replaceTopViewport: (viewport: MapStackViewport) => void;
  clear: () => void;
}

export const IDENTITY_VIEWPORT: MapStackViewport = Object.freeze({
  scale: 1,
  translateX: 0,
  translateY: 0,
});

export const useWorldMapStackStore = create<WorldMapStackState>()(
  persist(
    (set) => ({
      stack: [],
      viewportByMapId: {},
      reset: (entry) =>
        set((state) => ({
          stack: [entry],
          viewportByMapId: { ...state.viewportByMapId, [entry.mapId]: entry.viewport },
        })),
      push: (entry) =>
        set((state) => ({
          stack: [...state.stack, entry],
          viewportByMapId: { ...state.viewportByMapId, [entry.mapId]: entry.viewport },
        })),
      pop: () =>
        set((state) =>
          state.stack.length <= 1 ? state : { stack: state.stack.slice(0, -1) },
        ),
      popTo: (depth) =>
        set((state) => ({ stack: state.stack.slice(0, Math.max(1, depth + 1)) })),
      replaceTopViewport: (viewport) =>
        set((state) => {
          if (state.stack.length === 0) return state;
          const top = state.stack[state.stack.length - 1];
          const nextStack = [
            ...state.stack.slice(0, -1),
            { ...top, viewport },
          ];
          return {
            stack: nextStack,
            viewportByMapId: { ...state.viewportByMapId, [top.mapId]: viewport },
          };
        }),
      clear: () => set({ stack: [] }),
    }),
    {
      name: 'vaultstone.world-map-stack',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the per-map viewport memory survives a reload — drill state is
      // intentionally session-only.
      partialize: (s) => ({ viewportByMapId: s.viewportByMapId }),
    },
  ),
);

export function selectBreadcrumbs(s: WorldMapStackState) {
  return s.stack.map((e, i) => ({
    mapId: e.mapId,
    label: e.breadcrumbLabel,
    depth: i,
  }));
}
