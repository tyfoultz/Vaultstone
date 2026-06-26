import { createContext, useContext } from 'react';
import type { AiChatContext as AiSeed } from '@vaultstone/ai';

/** Context the host seeds the assistant with (campaign/world/character ids +
 *  role). Mirrors the FloatingNotes register/open/close/toggle shape. */
export type AiChatSeed = AiSeed;

type AiChatAPI = {
  /** Register seed info so the launch affordance can render. Does not open. */
  register: (seed: AiChatSeed) => void;
  /** Register + open in one call. */
  open: (seed: AiChatSeed) => void;
  /** Minimize — collapse the panel. */
  close: () => void;
  /** Toggle open/closed. */
  toggle: () => void;
  isOpen: boolean;
  isRegistered: boolean;
};

const AiChatCtx = createContext<AiChatAPI>({
  register: () => {},
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: false,
  isRegistered: false,
});

export const AiChatProvider = AiChatCtx.Provider;

export function useAiChat(): AiChatAPI {
  return useContext(AiChatCtx);
}
