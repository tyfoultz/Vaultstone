import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SidebarCollapseState {
  collapsed: Record<string, boolean>;
  toggle: (key: string) => void;
  setCollapsed: (key: string, value: boolean) => void;
}

export const useSidebarCollapseStore = create<SidebarCollapseState>()(
  persist(
    (set) => ({
      collapsed: {},

      toggle: (key) =>
        set((state) => ({
          collapsed: {
            ...state.collapsed,
            [key]: !state.collapsed[key],
          },
        })),

      setCollapsed: (key, value) =>
        set((state) => ({
          collapsed: {
            ...state.collapsed,
            [key]: value,
          },
        })),
    }),
    {
      name: 'sidebar-collapse',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
