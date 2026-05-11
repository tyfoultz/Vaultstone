import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type HomebrewContentRow = Database['public']['Tables']['homebrew_content']['Row'];
type ImportedContentRow = Database['public']['Tables']['imported_content']['Row'];

type PackCache = {
  authored: HomebrewContentRow[];
  imported: ImportedContentRow[];
  fetchedAt: number;
};

const STALE_MS = 5 * 60_000;

interface PackContentState {
  byPackId: Record<string, PackCache>;
  setPackContent: (
    packId: string,
    authored: HomebrewContentRow[],
    imported: ImportedContentRow[],
  ) => void;
  clearPack: (packId: string) => void;
}

export const usePackContentStore = create<PackContentState>((set) => ({
  byPackId: {},

  setPackContent: (packId, authored, imported) =>
    set((state) => ({
      byPackId: {
        ...state.byPackId,
        [packId]: { authored, imported, fetchedAt: Date.now() },
      },
    })),

  clearPack: (packId) =>
    set((state) => {
      const next = { ...state.byPackId };
      delete next[packId];
      return { byPackId: next };
    }),
}));

export function selectPackCache(
  state: PackContentState,
  packId: string | undefined,
): PackCache | null {
  if (!packId) return null;
  const cached = state.byPackId[packId];
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > STALE_MS) return null;
  return cached;
}
