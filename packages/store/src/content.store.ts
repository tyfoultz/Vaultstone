import { create } from 'zustand';
import type { ContentResult } from '@vaultstone/types';

interface ContentState {
  searchResults: ContentResult[];
  isSearching: boolean;
  setSearchResults: (results: ContentResult[]) => void;
  setIsSearching: (value: boolean) => void;
}

export const useContentStore = create<ContentState>((set) => ({
  searchResults: [],
  isSearching: false,
  setSearchResults: (searchResults) => set({ searchResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
}));
