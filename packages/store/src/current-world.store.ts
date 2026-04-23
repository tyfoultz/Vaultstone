import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];

// Tracks the world the user is currently viewing, the optional campaign
// "lens" (4e), and the linked campaigns list that drives the dropdown.
interface CurrentWorldState {
  world: World | null;
  lensCampaignId: string | null;
  linkedCampaigns: Campaign[];
  playerViewPreview: boolean;
  setActiveWorld: (world: World | null) => void;
  clearActiveWorld: () => void;
  patchWorld: (patch: Partial<World>) => void;
  setLens: (campaignId: string | null) => void;
  setLinkedCampaigns: (campaigns: Campaign[]) => void;
  setPlayerViewPreview: (on: boolean) => void;
}

export const useCurrentWorldStore = create<CurrentWorldState>((set) => ({
  world: null,
  lensCampaignId: null,
  linkedCampaigns: [],
  playerViewPreview: false,
  setActiveWorld: (world) =>
    set({
      world,
      lensCampaignId: null,
      linkedCampaigns: [],
      playerViewPreview: false,
    }),
  clearActiveWorld: () =>
    set({
      world: null,
      lensCampaignId: null,
      linkedCampaigns: [],
      playerViewPreview: false,
    }),
  patchWorld: (patch) =>
    set((s) => ({ world: s.world ? { ...s.world, ...patch } : null })),
  setLens: (lensCampaignId) => set({ lensCampaignId }),
  setLinkedCampaigns: (linkedCampaigns) => set({ linkedCampaigns }),
  setPlayerViewPreview: (playerViewPreview) => set({ playerViewPreview }),
}));
