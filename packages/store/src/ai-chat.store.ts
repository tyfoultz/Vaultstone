import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '@vaultstone/ai';

// Stable empty reference so the selector doesn't return a fresh [] each render
// (React #185 — see CLAUDE.md Zustand selector-stability note).
const EMPTY: ChatMessage[] = [];

interface AiChatState {
  /** Chat history per campaign. Device-local only — never sent to Supabase. */
  messagesByCampaign: Record<string, ChatMessage[]>;
  /** Whether the user has acknowledged the Gemini data-processing disclosure. */
  disclosureAccepted: boolean;
  addMessage: (campaignId: string, message: ChatMessage) => void;
  clearCampaign: (campaignId: string) => void;
  acceptDisclosure: () => void;
}

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
      messagesByCampaign: {},
      disclosureAccepted: false,
      addMessage: (campaignId, message) =>
        set((state) => ({
          messagesByCampaign: {
            ...state.messagesByCampaign,
            [campaignId]: [
              ...(state.messagesByCampaign[campaignId] ?? EMPTY),
              message,
            ],
          },
        })),
      clearCampaign: (campaignId) =>
        set((state) => {
          const next = { ...state.messagesByCampaign };
          delete next[campaignId];
          return { messagesByCampaign: next };
        }),
      acceptDisclosure: () => set({ disclosureAccepted: true }),
    }),
    {
      name: 'vaultstone-ai-chat',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        messagesByCampaign: state.messagesByCampaign,
        disclosureAccepted: state.disclosureAccepted,
      }),
    },
  ),
);

/** Stable selector for one campaign's messages. */
export const selectCampaignMessages =
  (campaignId: string) =>
  (s: AiChatState): ChatMessage[] =>
    s.messagesByCampaign[campaignId] ?? EMPTY;
