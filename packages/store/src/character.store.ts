import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

export type CharacterListItem = Pick<Character,
  'id' | 'user_id' | 'name' | 'campaign_id' | 'system' | 'base_stats' |
  'avatar_url' | 'avatar_card_url' | 'created_at'
>;

const SWR_TTL = 5 * 60 * 1000; // 5 minutes

interface CharacterState {
  characters: CharacterListItem[];
  activeCharacter: Character | null;
  fetchedAt: number;
  setCharacters: (characters: CharacterListItem[]) => void;
  setActiveCharacter: (character: Character | null) => void;
  updateCharacterLocally: (id: string, updates: Partial<Character>) => void;
  isStale: () => boolean;
}

export const useCharacterStore = create<CharacterState>()(persist(
  (set, get) => ({
    characters: [],
    activeCharacter: null,
    fetchedAt: 0,
    setCharacters: (characters) => set({ characters, fetchedAt: Date.now() }),
    setActiveCharacter: (activeCharacter) => set({ activeCharacter }),
    updateCharacterLocally: (id, updates) =>
      set((state) => ({
        characters: state.characters.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
        activeCharacter: state.activeCharacter?.id === id
          ? { ...state.activeCharacter, ...updates }
          : state.activeCharacter,
      })),
    isStale: () => Date.now() - get().fetchedAt > SWR_TTL,
  }),
  {
    name: 'vaultstone-characters',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      characters: state.characters,
      fetchedAt: state.fetchedAt,
    }),
  },
));
