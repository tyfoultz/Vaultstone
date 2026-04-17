import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];

interface WorldsState {
  worlds: World[];
  setWorlds: (worlds: World[]) => void;
  addWorld: (world: World) => void;
  updateWorld: (id: string, patch: Partial<World>) => void;
  removeWorld: (id: string) => void;
}

export const useWorldsStore = create<WorldsState>((set) => ({
  worlds: [],
  setWorlds: (worlds) => set({ worlds }),
  addWorld: (world) =>
    set((state) => ({ worlds: [world, ...state.worlds] })),
  updateWorld: (id, patch) =>
    set((state) => ({
      worlds: state.worlds.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  removeWorld: (id) =>
    set((state) => ({
      worlds: state.worlds.filter((w) => w.id !== id),
    })),
}));
