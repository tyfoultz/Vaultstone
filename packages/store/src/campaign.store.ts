import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

interface CampaignState {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  setCampaigns: (campaigns: Campaign[]) => void;
  setActiveCampaign: (campaign: Campaign | null) => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  activeCampaign: null,
  setCampaigns: (campaigns) => set({ campaigns }),
  setActiveCampaign: (activeCampaign) => set({ activeCampaign }),
}));
