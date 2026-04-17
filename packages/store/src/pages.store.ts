import { create } from 'zustand';
import type { WorldPage, WorldPageTreeNode } from '@vaultstone/types';

interface PagesState {
  byWorldId: Record<string, WorldPage[]>;
  setPagesForWorld: (worldId: string, pages: WorldPage[]) => void;
  addPage: (page: WorldPage) => void;
  updatePage: (id: string, patch: Partial<WorldPage>) => void;
  removePage: (id: string) => void;
  clearWorld: (worldId: string) => void;
}

const sortByOrder = (a: WorldPage, b: WorldPage) => a.sort_order - b.sort_order;

export const usePagesStore = create<PagesState>((set) => ({
  byWorldId: {},

  setPagesForWorld: (worldId, pages) =>
    set((state) => ({
      byWorldId: {
        ...state.byWorldId,
        [worldId]: [...pages].sort(sortByOrder),
      },
    })),

  addPage: (page) =>
    set((state) => {
      const current = state.byWorldId[page.world_id] ?? [];
      return {
        byWorldId: {
          ...state.byWorldId,
          [page.world_id]: [...current, page].sort(sortByOrder),
        },
      };
    }),

  updatePage: (id, patch) =>
    set((state) => {
      const next: Record<string, WorldPage[]> = {};
      for (const [worldId, pages] of Object.entries(state.byWorldId)) {
        next[worldId] = pages
          .map((p) => (p.id === id ? { ...p, ...patch } : p))
          .sort(sortByOrder);
      }
      return { byWorldId: next };
    }),

  removePage: (id) =>
    set((state) => {
      const next: Record<string, WorldPage[]> = {};
      for (const [worldId, pages] of Object.entries(state.byWorldId)) {
        next[worldId] = pages.filter((p) => p.id !== id);
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

export function selectPagesForSection(
  state: PagesState,
  worldId: string,
  sectionId: string,
): WorldPage[] {
  const pages = state.byWorldId[worldId] ?? [];
  return pages.filter((p) => p.section_id === sectionId);
}

const SIDEBAR_DEPTH_CAP = 6;

export function selectPageTree(
  state: PagesState,
  worldId: string,
  sectionId: string,
): WorldPageTreeNode[] {
  const pages = (state.byWorldId[worldId] ?? []).filter(
    (p) => p.section_id === sectionId,
  );
  const byParent = new Map<string | null, WorldPage[]>();
  for (const page of pages) {
    const parent = page.parent_page_id ?? null;
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(page);
    else byParent.set(parent, [page]);
  }

  const build = (parent: string | null, depth: number): WorldPageTreeNode[] => {
    const kids = (byParent.get(parent) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    return kids.map((page) => ({
      page,
      depth: Math.min(depth, SIDEBAR_DEPTH_CAP),
      children: build(page.id, depth + 1),
    }));
  };

  return build(null, 0);
}
