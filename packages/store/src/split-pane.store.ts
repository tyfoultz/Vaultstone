import { create } from 'zustand';

/**
 * Discriminated union describing what's pinned to a tab.
 *
 *   - `campaign` — the host campaign page itself. Always present in
 *     the strip on the campaign route, can't be closed, but otherwise
 *     behaves like any other tab: it can move between sides, be
 *     focused, etc. Carrying it in the same data structure as the
 *     other targets keeps the reorder/move/drop logic uniform.
 *   - `world-page` — a world wiki page (also used by the world detail
 *     route's own split shell).
 *   - `character` — a character sheet.
 *   - `world-home` — the world overview screen.
 *   - `world-map-index` — the world's map landing route.
 *   - `world-map` — a specific map with its pin canvas + zoom UI.
 *   - `world-relations` — the relationship-web graph for the world.
 */
export type SplitTarget =
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'world-page'; worldId: string; pageId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'world-home'; worldId: string }
  | { kind: 'world-map-index'; worldId: string }
  | { kind: 'world-map'; worldId: string; mapId: string }
  | { kind: 'world-relations'; worldId: string };

export type Side = 'left' | 'right';

/**
 * Split pane state — browser-style tabs split across two panes.
 *
 *   - `leftTabs` + `rightTabs` are the ordered tab lists per side.
 *     Tabs can flow freely between them via drag-reorder.
 *   - `leftActiveIndex` / `rightActiveIndex` select which tab is
 *     rendered in each pane. They always point into the matching
 *     list when the list is non-empty; an empty side has a null
 *     active index and its pane collapses (the other side renders
 *     full-width).
 *   - `focusedSide` tracks which pane received the last click —
 *     used so newly opened tabs land on the side the user was
 *     interacting with.
 *
 * The campaign tab is a regular `{ kind: 'campaign' }` entry. It
 * starts on the left side on mount, but the user can drag it
 * anywhere. The store enforces one invariant at the boundary: the
 * last campaign tab cannot be closed.
 */
interface SplitPaneState {
  leftTabs: SplitTarget[];
  rightTabs: SplitTarget[];
  leftActiveIndex: number | null;
  rightActiveIndex: number | null;
  splitRatio: number;
  focusedSide: Side;

  /** Add a new tab on the focused side (deduped). If an equivalent
   *  target is already open on either side, focus it instead of
   *  opening a duplicate. */
  openSplit: (target: SplitTarget) => void;
  /** Close the tab at (side, index). No-op for the campaign tab. */
  closeSplitTab: (side: Side, index: number) => void;
  /** Convenience: close the active tab on the focused side. */
  closeSplit: () => void;
  /** Focus a tab; flips `focusedSide` accordingly. */
  setActiveSplitTab: (side: Side, index: number) => void;
  /** Replace the entire two-list state (used by URL hydration). */
  setSplitState: (state: {
    leftTabs: SplitTarget[];
    rightTabs: SplitTarget[];
    leftActiveIndex: number | null;
    rightActiveIndex: number | null;
  }) => void;
  /** Move a tab. Both `from` and `to` are `{ side, index }` so a tab
   *  can be reordered within a side, or dragged across sides. After
   *  the move the moved tab is focused on its new side. */
  moveSplitTab: (
    from: { side: Side; index: number },
    to: { side: Side; index: number },
  ) => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedSide: (side: Side) => void;
}

const initialCampaign: SplitTarget[] = [];

export const useSplitPaneStore = create<SplitPaneState>((set, get) => ({
  leftTabs: initialCampaign,
  rightTabs: [],
  leftActiveIndex: null,
  rightActiveIndex: null,
  splitRatio: 0.5,
  focusedSide: 'left',

  openSplit: (target) => {
    const { leftTabs, rightTabs, focusedSide } = get();
    // Dedupe across both sides — focus the existing tab if any.
    const leftIdx = leftTabs.findIndex((t) => sameTarget(t, target));
    if (leftIdx >= 0) {
      set({ leftActiveIndex: leftIdx, focusedSide: 'left' });
      return;
    }
    const rightIdx = rightTabs.findIndex((t) => sameTarget(t, target));
    if (rightIdx >= 0) {
      set({ rightActiveIndex: rightIdx, focusedSide: 'right' });
      return;
    }
    // New tab lands on the right side by default (the campaign sits
    // on the left), unless the right side is the active one and the
    // user explicitly focused something elsewhere — we still go right
    // because the "campaign + sheet" model is the dominant case.
    // If the right side is empty, it pops open at 50/50.
    const wasRightEmpty = rightTabs.length === 0;
    if (focusedSide === 'left' && leftTabs.length === 0) {
      // Edge case: campaign was dragged out and the user is opening
      // a fresh tab while no left tab exists. Land on left.
      set({
        leftTabs: [target],
        leftActiveIndex: 0,
        focusedSide: 'left',
      });
      return;
    }
    const nextRight = [...rightTabs, target];
    set({
      rightTabs: nextRight,
      rightActiveIndex: nextRight.length - 1,
      focusedSide: 'right',
      splitRatio: wasRightEmpty ? 0.5 : get().splitRatio,
    });
  },

  closeSplitTab: (side, index) => {
    const tabs = side === 'left' ? get().leftTabs : get().rightTabs;
    const target = tabs[index];
    if (!target) return;
    // Don't let the last campaign tab disappear. (We only ever start
    // with one; this guard catches future ambiguity.)
    if (target.kind === 'campaign' && countCampaignTabs(get()) <= 1) return;
    const next = tabs.filter((_, i) => i !== index);
    const active = side === 'left' ? get().leftActiveIndex : get().rightActiveIndex;
    let nextActive: number | null;
    if (next.length === 0) {
      nextActive = null;
    } else if (active == null) {
      nextActive = next.length - 1;
    } else if (index < active) {
      nextActive = active - 1;
    } else if (index === active) {
      nextActive = Math.max(0, index - 1);
    } else {
      nextActive = active;
    }
    if (side === 'left') {
      set({ leftTabs: next, leftActiveIndex: nextActive, focusedSide: next.length === 0 ? 'right' : 'left' });
    } else {
      set({ rightTabs: next, rightActiveIndex: nextActive, focusedSide: next.length === 0 ? 'left' : 'right' });
    }
  },

  closeSplit: () => {
    const { focusedSide, leftActiveIndex, rightActiveIndex } = get();
    const idx = focusedSide === 'left' ? leftActiveIndex : rightActiveIndex;
    if (idx == null) return;
    get().closeSplitTab(focusedSide, idx);
  },

  setActiveSplitTab: (side, index) => {
    const tabs = side === 'left' ? get().leftTabs : get().rightTabs;
    if (index < 0 || index >= tabs.length) return;
    if (side === 'left') set({ leftActiveIndex: index, focusedSide: 'left' });
    else set({ rightActiveIndex: index, focusedSide: 'right' });
  },

  setSplitState: ({ leftTabs, rightTabs, leftActiveIndex, rightActiveIndex }) => {
    const clamp = (tabs: SplitTarget[], idx: number | null): number | null => {
      if (tabs.length === 0) return null;
      if (idx == null) return 0;
      return Math.max(0, Math.min(tabs.length - 1, idx));
    };
    set({
      leftTabs,
      rightTabs,
      leftActiveIndex: clamp(leftTabs, leftActiveIndex),
      rightActiveIndex: clamp(rightTabs, rightActiveIndex),
      focusedSide: leftTabs.length > 0 ? 'left' : 'right',
    });
  },

  moveSplitTab: (from, to) => {
    const state = get();
    const fromTabs = from.side === 'left' ? state.leftTabs : state.rightTabs;
    const toTabsSrc = to.side === 'left' ? state.leftTabs : state.rightTabs;
    const moved = fromTabs[from.index];
    if (!moved) return;
    if (from.side === to.side && from.index === to.index) return;

    // Build the new lists. Remove from source first; if same side,
    // adjust the destination index for the gap left behind.
    const nextFrom = fromTabs.filter((_, i) => i !== from.index);
    let nextTo: SplitTarget[];
    let landedAt: number;
    if (from.side === to.side) {
      const adjusted = from.index < to.index ? to.index - 1 : to.index;
      const clamped = Math.max(0, Math.min(nextFrom.length, adjusted));
      nextTo = [...nextFrom];
      nextTo.splice(clamped, 0, moved);
      landedAt = clamped;
    } else {
      const clamped = Math.max(0, Math.min(toTabsSrc.length, to.index));
      nextTo = [...toTabsSrc];
      nextTo.splice(clamped, 0, moved);
      landedAt = clamped;
    }

    // Compute new active indexes per side. The moved tab is now
    // focused on its destination side; the source side's active index
    // shifts to stay on the same logical tab when possible.
    if (from.side === to.side) {
      // Same-side reorder.
      const prevActive = from.side === 'left' ? state.leftActiveIndex : state.rightActiveIndex;
      let newActive = prevActive;
      if (prevActive == null) {
        newActive = landedAt;
      } else if (prevActive === from.index) {
        newActive = landedAt;
      } else if (from.index < prevActive && landedAt >= prevActive) {
        newActive = prevActive - 1;
      } else if (from.index > prevActive && landedAt <= prevActive) {
        newActive = prevActive + 1;
      }
      if (from.side === 'left') {
        set({ leftTabs: nextTo, leftActiveIndex: newActive, focusedSide: 'left' });
      } else {
        set({ rightTabs: nextTo, rightActiveIndex: newActive, focusedSide: 'right' });
      }
      return;
    }

    // Cross-side move.
    const prevFromActive = from.side === 'left' ? state.leftActiveIndex : state.rightActiveIndex;
    const prevToActive = to.side === 'left' ? state.leftActiveIndex : state.rightActiveIndex;

    let nextFromActive: number | null = prevFromActive;
    if (nextFrom.length === 0) {
      nextFromActive = null;
    } else if (prevFromActive == null) {
      nextFromActive = 0;
    } else if (from.index < prevFromActive) {
      nextFromActive = prevFromActive - 1;
    } else if (from.index === prevFromActive) {
      nextFromActive = Math.max(0, from.index - 1);
    }

    const nextToActive = landedAt;

    if (from.side === 'left') {
      // Source = left, destination = right.
      set({
        leftTabs: nextFrom,
        rightTabs: nextTo,
        leftActiveIndex: nextFromActive,
        rightActiveIndex: nextToActive,
        focusedSide: 'right',
      });
    } else {
      // Source = right, destination = left.
      set({
        rightTabs: nextFrom,
        leftTabs: nextTo,
        rightActiveIndex: nextFromActive,
        leftActiveIndex: nextToActive,
        focusedSide: 'left',
      });
    }
  },

  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
  setFocusedSide: (side) => set({ focusedSide: side }),
}));

function countCampaignTabs(s: { leftTabs: SplitTarget[]; rightTabs: SplitTarget[] }): number {
  let n = 0;
  for (const t of s.leftTabs) if (t.kind === 'campaign') n++;
  for (const t of s.rightTabs) if (t.kind === 'campaign') n++;
  return n;
}

/**
 * Active target on the focused side, or null when that side is empty.
 * Used by readers that just want "what's the user looking at."
 */
export function selectActiveSplitTarget(
  s: {
    leftTabs: SplitTarget[];
    rightTabs: SplitTarget[];
    leftActiveIndex: number | null;
    rightActiveIndex: number | null;
    focusedSide: Side;
  },
): SplitTarget | null {
  const idx = s.focusedSide === 'left' ? s.leftActiveIndex : s.rightActiveIndex;
  if (idx == null) return null;
  const tabs = s.focusedSide === 'left' ? s.leftTabs : s.rightTabs;
  return tabs[idx] ?? null;
}

/**
 * Active target per side. Used by the layout to render each pane's body.
 */
export function selectActiveTargets(
  s: {
    leftTabs: SplitTarget[];
    rightTabs: SplitTarget[];
    leftActiveIndex: number | null;
    rightActiveIndex: number | null;
  },
): { left: SplitTarget | null; right: SplitTarget | null } {
  return {
    left: s.leftActiveIndex == null ? null : s.leftTabs[s.leftActiveIndex] ?? null,
    right: s.rightActiveIndex == null ? null : s.rightTabs[s.rightActiveIndex] ?? null,
  };
}

/**
 * Returns the active `world-page` id when one is the active tab on
 * either side. Used by the world detail route.
 */
export function selectSplitPageId(
  s: {
    leftTabs: SplitTarget[];
    rightTabs: SplitTarget[];
    leftActiveIndex: number | null;
    rightActiveIndex: number | null;
    focusedSide: Side;
  },
): string | null {
  const active = selectActiveSplitTarget(s);
  return active?.kind === 'world-page' ? active.pageId : null;
}

/**
 * Encode a single target as a compact URL-query-friendly token.
 * `campaign:cid` is included even though the campaign route knows
 * its own id — it preserves position when the user has dragged the
 * campaign tab.
 */
export function encodeSplitTarget(target: SplitTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'campaign': return `campaign:${target.campaignId}`;
    case 'character': return `char:${target.characterId}`;
    case 'world-page': return `worldpage:${target.worldId}:${target.pageId}`;
    case 'world-home': return `worldhome:${target.worldId}`;
    case 'world-map-index': return `worldmaps:${target.worldId}`;
    case 'world-map': return `worldmap:${target.worldId}:${target.mapId}`;
    case 'world-relations': return `worldrelations:${target.worldId}`;
  }
}

export function decodeSplitTarget(raw: string | null | undefined): SplitTarget | null {
  if (!raw) return null;
  if (raw.startsWith('campaign:')) {
    const id = raw.slice(9);
    return id ? { kind: 'campaign', campaignId: id } : null;
  }
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
  if (raw.startsWith('worldmaps:')) {
    const id = raw.slice(10);
    return id ? { kind: 'world-map-index', worldId: id } : null;
  }
  if (raw.startsWith('worldmap:')) {
    const parts = raw.slice(9).split(':');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { kind: 'world-map', worldId: parts[0], mapId: parts[1] };
    }
  }
  if (raw.startsWith('worldrelations:')) {
    const id = raw.slice(15);
    return id ? { kind: 'world-relations', worldId: id } : null;
  }
  return null;
}

/**
 * Encode the two-pane tab state for the URL.
 *
 *   leftTabs=[campaign:c, worldhome:w] activeLeft=0
 *   rightTabs=[char:x, char:y] activeRight=1
 *     → "L:campaign:c,worldhome:w@0;R:char:x,char:y@1"
 *
 * Either side may be empty (omitted entirely).
 */
export function encodeSplitTabs(state: {
  leftTabs: SplitTarget[];
  rightTabs: SplitTarget[];
  leftActiveIndex: number | null;
  rightActiveIndex: number | null;
}): string | null {
  const parts: string[] = [];
  const encodeSide = (prefix: 'L' | 'R', tabs: SplitTarget[], active: number | null) => {
    if (tabs.length === 0) return;
    const tokens = tabs.map((t) => encodeSplitTarget(t)).filter((s): s is string => !!s);
    if (tokens.length === 0) return;
    const idx = active == null ? 0 : Math.max(0, Math.min(tokens.length - 1, active));
    parts.push(`${prefix}:${tokens.join(',')}@${idx}`);
  };
  encodeSide('L', state.leftTabs, state.leftActiveIndex);
  encodeSide('R', state.rightTabs, state.rightActiveIndex);
  if (parts.length === 0) return null;
  return parts.join(';');
}

export function decodeSplitTabs(
  raw: string | null | undefined,
): {
  leftTabs: SplitTarget[];
  rightTabs: SplitTarget[];
  leftActiveIndex: number | null;
  rightActiveIndex: number | null;
} {
  const empty = { leftTabs: [], rightTabs: [], leftActiveIndex: null, rightActiveIndex: null };
  if (!raw) return empty;
  const segments = raw.split(';');
  const result: {
    leftTabs: SplitTarget[];
    rightTabs: SplitTarget[];
    leftActiveIndex: number | null;
    rightActiveIndex: number | null;
  } = { leftTabs: [], rightTabs: [], leftActiveIndex: null, rightActiveIndex: null };
  for (const seg of segments) {
    if (seg.startsWith('L:')) {
      const parsed = parseSide(seg.slice(2));
      result.leftTabs = parsed.tabs;
      result.leftActiveIndex = parsed.activeIndex;
    } else if (seg.startsWith('R:')) {
      const parsed = parseSide(seg.slice(2));
      result.rightTabs = parsed.tabs;
      result.rightActiveIndex = parsed.activeIndex;
    }
  }
  return result;
}

function parseSide(raw: string): { tabs: SplitTarget[]; activeIndex: number | null } {
  const [tokenPart, idxPart] = raw.split('@');
  const tokens = tokenPart.split(',').filter((s) => s.length > 0);
  const tabs = tokens
    .map((t) => decodeSplitTarget(t))
    .filter((t): t is SplitTarget => t !== null);
  if (tabs.length === 0) return { tabs: [], activeIndex: null };
  const parsedIdx = idxPart != null ? Number.parseInt(idxPart, 10) : NaN;
  const activeIndex = Number.isFinite(parsedIdx)
    ? Math.max(0, Math.min(tabs.length - 1, parsedIdx))
    : 0;
  return { tabs, activeIndex };
}

/**
 * Structural equality for split targets — used to dedupe on
 * `openSplit`.
 */
function sameTarget(a: SplitTarget, b: SplitTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'campaign':
      return a.campaignId === (b as typeof a).campaignId;
    case 'character':
      return a.characterId === (b as typeof a).characterId;
    case 'world-page':
      return a.worldId === (b as typeof a).worldId && a.pageId === (b as typeof a).pageId;
    case 'world-home':
    case 'world-map-index':
    case 'world-relations':
      return a.worldId === (b as typeof a).worldId;
    case 'world-map':
      return a.worldId === (b as typeof a).worldId && a.mapId === (b as typeof a).mapId;
  }
}
