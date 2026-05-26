import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];

const SWR_TTL = 10 * 60 * 1000; // 10 minutes

interface WorldsState {
  worlds: World[];
  fetchedAt: number;
  setWorlds: (worlds: World[]) => void;
  addWorld: (world: World) => void;
  updateWorld: (id: string, patch: Partial<World>) => void;
  removeWorld: (id: string) => void;
  isStale: () => boolean;
}

export const useWorldsStore = create<WorldsState>()(persist(
  (set, get) => ({
    worlds: [],
    fetchedAt: 0,
    setWorlds: (worlds) => set({ worlds, fetchedAt: Date.now() }),
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
    isStale: () => Date.now() - get().fetchedAt > SWR_TTL,
  }),
  {
    name: 'vaultstone-worlds',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      worlds: state.worlds,
      fetchedAt: state.fetchedAt,
    }),
  },
));
