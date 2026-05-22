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
  // Apply a local-only update to both the list and (when matching) the
  // activeCharacter pointer. Without keeping `activeCharacter` in
  // lockstep, any flow that reads it later — most notably the level-up
  // wizard, which seeds its working copy from `activeCharacter` — sees
  // a stale snapshot from initial load, and writing the level-up
  // result back to the DB overwrites everything the player did on the
  // sheet in the meantime (added features, edited descriptions, etc.).
  updateCharacterLocally: (id, updates) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
      activeCharacter: state.activeCharacter?.id === id
        ? { ...state.activeCharacter, ...updates }
        : state.activeCharacter,
    })),
}));
