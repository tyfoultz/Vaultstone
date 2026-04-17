import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];

// Tracks the world the user is currently viewing and the optional campaign
// "lens" (Phase 4 will wire LensDropdown; Phase 1 just reserves the surface).
interface CurrentWorldState {
  world: World | null;
  lensCampaignId: string | null;
  setActiveWorld: (world: World | null) => void;
  clearActiveWorld: () => void;
  setLens: (campaignId: string | null) => void;
}

export const useCurrentWorldStore = create<CurrentWorldState>((set) => ({
  world: null,
  lensCampaignId: null,
  setActiveWorld: (world) => set({ world, lensCampaignId: null }),
  clearActiveWorld: () => set({ world: null, lensCampaignId: null }),
  setLens: (lensCampaignId) => set({ lensCampaignId }),
}));
