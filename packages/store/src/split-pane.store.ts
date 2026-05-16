import { create } from 'zustand';

/**
 * Discriminated union describing what's pinned to the split pane.
 *
 *   - `world-page` — the original use case: two world pages side-by-side
 *     on the world detail route. `worldId` lets the renderer load
 *     metadata; `pageId` is the actual content target.
 *   - `character` — character sheet pinned alongside a campaign page.
 *   - `world-home` — the full world overview screen (the same surface
 *     as `app/world/[worldId]/index.tsx`), embedded inside a host
 *     route. Used by the campaign page's split-tab picker so the user
 *     can drop their linked world's home into the split slot.
 *
 * Adding a new pane target is just adding another arm here plus a
 * matching render in the SplitPaneShell host.
 */
export type SplitTarget =
  | { kind: 'world-page'; worldId: string; pageId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'world-home'; worldId: string };

interface SplitPaneState {
  splitTarget: SplitTarget | null;
  splitRatio: number;
  focusedPane: 'primary' | 'split';
  openSplit: (target: SplitTarget) => void;
  closeSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedPane: (pane: 'primary' | 'split') => void;
}

export const useSplitPaneStore = create<SplitPaneState>((set) => ({
  splitTarget: null,
  splitRatio: 0.5,
  focusedPane: 'split',
  openSplit: (target) =>
    set({ splitTarget: target, splitRatio: 0.5, focusedPane: 'split' }),
  closeSplit: () =>
    set({ splitTarget: null, splitRatio: 0.5, focusedPane: 'primary' }),
  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
  setFocusedPane: (pane) => set({ focusedPane: pane }),
}));

/**
 * Selector helper for callers that only care about a world-page split.
 * Returns the pinned page id when a world page is in the split slot,
 * otherwise null. Keeps the world-detail route's call sites tidy.
 */
export function selectSplitPageId(s: { splitTarget: SplitTarget | null }): string | null {
  return s.splitTarget?.kind === 'world-page' ? s.splitTarget.pageId : null;
}

/**
 * Encode a split target as a compact URL-query-friendly string.
 *
 *   { kind: 'character', characterId: 'abc' }
 *     → 'char:abc'
 *   { kind: 'world-page', worldId: 'w', pageId: 'p' }
 *     → 'worldpage:w:p'
 *
 * Null targets serialize to null so the caller can drop the param.
 */
export function encodeSplitTarget(target: SplitTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'character': return `char:${target.characterId}`;
    case 'world-page': return `worldpage:${target.worldId}:${target.pageId}`;
    case 'world-home': return `worldhome:${target.worldId}`;
  }
}

/**
 * Inverse of `encodeSplitTarget`. Tolerant of garbage input — anything
 * that doesn't match a known shape returns null so we don't crash on
 * a stale or hand-edited URL.
 */
export function decodeSplitTarget(raw: string | null | undefined): SplitTarget | null {
  if (!raw) return null;
  if (raw.startsWith('char:')) {
    const id = raw.slice(5);
    return id ? { kind: 'character', characterId: id } : null;
  }
  if (raw.startsWith('worldpage:')) {
    const parts = raw.slice(10).split(':');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { kind: 'world-page', worldId: parts[0], pageId: parts[1] };
    }
  }
  if (raw.startsWith('worldhome:')) {
    const id = raw.slice(10);
    return id ? { kind: 'world-home', worldId: id } : null;
  }
  return null;
}
