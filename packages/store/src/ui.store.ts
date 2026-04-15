import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// DM-side, device-local UI state. Per-campaign lists of collapsed member
// cards let a DM hide PCs they're not actively running without losing
// state across refreshes. Device-local is intentional — collapse is a
// personal view affordance, not campaign state.
interface UiState {
  collapsedMemberIds: Record<string, string[]>;
  toggleCollapsed: (campaignId: string, userId: string) => void;
  isCollapsed: (campaignId: string, userId: string) => boolean;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      collapsedMemberIds: {},

      toggleCollapsed: (campaignId, userId) => set((state) => {
        const current = state.collapsedMemberIds[campaignId] ?? [];
        const next = current.includes(userId)
          ? current.filter((u) => u !== userId)
          : [...current, userId];
        return {
          collapsedMemberIds: { ...state.collapsedMemberIds, [campaignId]: next },
        };
      }),

      isCollapsed: (campaignId, userId) => {
        const list = get().collapsedMemberIds[campaignId];
        return Array.isArray(list) && list.includes(userId);
      },
    }),
    {
      name: 'ui-party-view',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
