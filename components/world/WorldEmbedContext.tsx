import { createContext, useContext } from 'react';

/**
 * Navigation targets that an embed host may intercept. Every route
 * push inside the world sidebar / world home / page pane funnels
 * through `useWorldEmbedNavigate` and consults the context first.
 * When the host returns `true`, the default `router.push` is skipped
 * and the host handles the navigation (typically by re-pinning the
 * split target). When `false` (or no host is mounted), the call
 * falls through to a normal route push and the user navigates out
 * of the host context.
 */
export type WorldEmbedTarget =
  | { kind: 'world-home'; worldId: string }
  | { kind: 'world-page'; worldId: string; pageId: string }
  | { kind: 'world-section'; worldId: string; sectionId: string }
  | { kind: 'world-map-index'; worldId: string }
  | { kind: 'world-map'; worldId: string; mapId: string }
  | { kind: 'world-relations'; worldId: string }
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'app-home' };

export type WorldEmbedNavigate = (target: WorldEmbedTarget) => boolean;

const WorldEmbedContext = createContext<WorldEmbedNavigate | null>(null);

export const WorldEmbedProvider = WorldEmbedContext.Provider;

/**
 * Returns the host-side navigate handler, or `null` when no host is
 * mounted (i.e. the standalone world route). Call sites should fall
 * back to `router.push` whenever this returns null or the handler
 * returns false.
 */
export function useWorldEmbedNavigate(): WorldEmbedNavigate | null {
  return useContext(WorldEmbedContext);
}
