import { createContext, useContext } from 'react';

export type FloatingNotesState = {
  sessionId: string;
  userId: string;
  campaignId: string;
  isDM: boolean;
  memberNames: Map<string, string>;
};

type FloatingNotesAPI = {
  /** Register session info so the pill renders. Does NOT open the panel. */
  register: (state: FloatingNotesState) => void;
  /** Register + open in one call. */
  open: (state: FloatingNotesState) => void;
  /** Minimize — collapse the panel, pill stays. */
  close: () => void;
  /** Toggle the panel open/closed (pill stays). */
  toggle: () => void;
  isOpen: boolean;
  isRegistered: boolean;
};

const FloatingNotesCtx = createContext<FloatingNotesAPI>({
  register: () => {},
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: false,
  isRegistered: false,
});

export const FloatingNotesProvider = FloatingNotesCtx.Provider;

export function useFloatingNotes(): FloatingNotesAPI {
  return useContext(FloatingNotesCtx);
}
