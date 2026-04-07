import { create } from 'zustand';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

interface CharacterState {
  characters: Character[];
  activeCharacter: Character | null;
  setCharacters: (characters: Character[]) => void;
  setActiveCharacter: (character: Character | null) => void;
  updateCharacterLocally: (id: string, updates: Partial<Character>) => void;
}

export const useCharacterStore = create<CharacterState>((set) => ({
  characters: [],
  activeCharacter: null,
  setCharacters: (characters) => set({ characters }),
  setActiveCharacter: (activeCharacter) => set({ activeCharacter }),
  updateCharacterLocally: (id, updates) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
}));
