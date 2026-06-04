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
  isOpen: boolean;
};

const FloatingNotesCtx = createContext<FloatingNotesAPI>({
  open: () => {},
  close: () => {},
  isOpen: false,
});

export const FloatingNotesProvider = FloatingNotesCtx.Provider;

export function useFloatingNotes(): FloatingNotesAPI {
  return useContext(FloatingNotesCtx);
}
