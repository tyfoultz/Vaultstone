import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

interface CampaignState {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  setCampaigns: (campaigns: Campaign[]) => void;
  setActiveCampaign: (campaign: Campaign | null) => void;
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  removeCampaign: (id: string) => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  activeCampaign: null,
  setCampaigns: (campaigns) => set({ campaigns }),
  setActiveCampaign: (activeCampaign) => set({ activeCampaign }),
  addCampaign: (campaign) =>
    set((state) => ({ campaigns: [campaign, ...state.campaigns] })),
  updateCampaign: (id, patch) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      activeCampaign:
        state.activeCampaign?.id === id
          ? { ...state.activeCampaign, ...patch }
          : state.activeCampaign,
    })),
  removeCampaign: (id) =>
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== id),
      activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
    })),
}));
