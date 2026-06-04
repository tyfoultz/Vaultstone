import { createContext, useContext } from 'react';

export type FloatingNotesState = {
  sessionId: string;
  userId: string;
  campaignId: string;
  isDM: boolean;
  memberNames: Map<string, string>;
};

type FloatingNotesAPI = {
  open: (state: FloatingNotesState) => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
  isOpen: boolean;
  isMinimized: boolean;
};

const FloatingNotesCtx = createContext<FloatingNotesAPI>({
  open: () => {},
  close: () => {},
  minimize: () => {},
  restore: () => {},
  isOpen: false,
  isMinimized: false,
});

export const FloatingNotesProvider = FloatingNotesCtx.Provider;

export function useFloatingNotes(): FloatingNotesAPI {
  return useContext(FloatingNotesCtx);
}
