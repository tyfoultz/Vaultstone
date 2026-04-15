import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-session recap drafts for the Campaign Notes Hub. The DM composes a recap
// over multiple sittings; we autosave to AsyncStorage until they hit Publish,
// which writes the text to `sessions.summary` and clears the draft here.
// AsyncStorage is device-scoped per signed-in user, so no extra per-DM key.
export interface RecapDraftState {
  bySessionId: Record<string, string>;
  setDraft: (sessionId: string, body: string) => void;
  clearDraft: (sessionId: string) => void;
}

export const useRecapDraftStore = create<RecapDraftState>()(
  persist(
    (set) => ({
      bySessionId: {},
      setDraft: (sessionId, body) =>
        set((prev) => ({ bySessionId: { ...prev.bySessionId, [sessionId]: body } })),
      clearDraft: (sessionId) =>
        set((prev) => {
          const next = { ...prev.bySessionId };
          delete next[sessionId];
          return { bySessionId: next };
        }),
    }),
    {
      name: 'vaultstone-recap-drafts',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
