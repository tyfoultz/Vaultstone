import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which spell attribute the mobile spell table renders in its
 * second column (next to NAME). Mobile drops the desktop's Range +
 * Time columns to give the spell name room to breathe; the user
 * picks which single attribute they want to scan against via the
 * column header dropdown. The choice persists per device.
 */
export type SpellColumnKey = 'school' | 'range' | 'time' | 'components' | 'duration';

export const SPELL_COLUMN_LABEL: Record<SpellColumnKey, string> = {
  school: 'School',
  range: 'Range',
  time: 'Time',
  components: 'Comp.',
  duration: 'Duration',
};

interface SpellsTabState {
  /** The user's chosen second column on the mobile spell table. */
  column2: SpellColumnKey;
  setColumn2: (next: SpellColumnKey) => void;
}

export const useSpellsTabStore = create<SpellsTabState>()(
  persist(
    (set) => ({
      column2: 'school',
      setColumn2: (next) => set({ column2: next }),
    }),
    {
      name: 'vaultstone-spells-tab',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
