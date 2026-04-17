import { create } from 'zustand';
import type { WorldSection } from '@vaultstone/types';

interface SectionsState {
  byWorldId: Record<string, WorldSection[]>;
  setSectionsForWorld: (worldId: string, sections: WorldSection[]) => void;
  addSection: (section: WorldSection) => void;
  updateSection: (id: string, patch: Partial<WorldSection>) => void;
  removeSection: (id: string) => void;
  clearWorld: (worldId: string) => void;
}

const sortByOrder = (a: WorldSection, b: WorldSection) => a.sort_order - b.sort_order;

export const useSectionsStore = create<SectionsState>((set) => ({
  byWorldId: {},

  setSectionsForWorld: (worldId, sections) =>
    set((state) => ({
      byWorldId: {
        ...state.byWorldId,
        [worldId]: [...sections].sort(sortByOrder),
      },
    })),

  addSection: (section) =>
    set((state) => {
      const current = state.byWorldId[section.world_id] ?? [];
      return {
        byWorldId: {
          ...state.byWorldId,
          [section.world_id]: [...current, section].sort(sortByOrder),
        },
      };
    }),

  updateSection: (id, patch) =>
    set((state) => {
      const next: Record<string, WorldSection[]> = {};
      for (const [worldId, sections] of Object.entries(state.byWorldId)) {
        next[worldId] = sections
          .map((s) => (s.id === id ? { ...s, ...patch } : s))
          .sort(sortByOrder);
      }
      return { byWorldId: next };
    }),

  removeSection: (id) =>
    set((state) => {
      const next: Record<string, WorldSection[]> = {};
      for (const [worldId, sections] of Object.entries(state.byWorldId)) {
        next[worldId] = sections.filter((s) => s.id !== id);
      }
      return { byWorldId: next };
    }),

  clearWorld: (worldId) =>
    set((state) => {
      const next = { ...state.byWorldId };
      delete next[worldId];
      return { byWorldId: next };
    }),
}));

// Stable empty sentinel so the selector returns the same reference when a
// world has no sections cached yet. Returning a fresh `[]` from a Zustand
// selector triggers React #185 ("Maximum update depth exceeded") via
// useSyncExternalStore, since each call looks like a state change.
const EMPTY_SECTIONS: WorldSection[] = [];

export function selectSectionsForWorld(
  state: SectionsState,
  worldId: string | undefined | null,
): WorldSection[] {
  if (!worldId) return EMPTY_SECTIONS;
  return state.byWorldId[worldId] ?? EMPTY_SECTIONS;
}
