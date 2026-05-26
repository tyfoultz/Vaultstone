import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

const SWR_TTL = 5 * 60 * 1000; // 5 minutes

interface CampaignState {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  fetchedAt: number;
  setCampaigns: (campaigns: Campaign[]) => void;
  setActiveCampaign: (campaign: Campaign | null) => void;
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  removeCampaign: (id: string) => void;
  isStale: () => boolean;
}

export const useCampaignStore = create<CampaignState>()(persist(
  (set, get) => ({
    campaigns: [],
    activeCampaign: null,
    fetchedAt: 0,
    setCampaigns: (campaigns) => set({ campaigns, fetchedAt: Date.now() }),
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
    isStale: () => Date.now() - get().fetchedAt > SWR_TTL,
  }),
  {
    name: 'vaultstone-campaigns',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      campaigns: state.campaigns,
      fetchedAt: state.fetchedAt,
    }),
  },
));
