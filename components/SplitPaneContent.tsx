// Dispatcher that renders the right body for whatever's pinned to the
// campaign's split slot. Kept thin: it just unwraps `SplitTarget` and
// delegates to the existing surface components (CharacterSheet for
// characters, PagePaneContent for world pages, WorldHome for the
// world overview). Adding a new arm = handle a new kind here.
//
// Embed-aware navigation: the world arms wrap their body in
// EmbeddedWorldShell, which mounts the world sidebar and a
// WorldEmbedContext. Every internal link inside the sidebar / world
// home / page pane funnels through that context and re-pins the
// split target instead of navigating the host route. From a
// drilled-into page, the home button on `SplitPaneTitle` rewinds
// back to the world home. The embed shell stays mounted across
// world-home ↔ world-page transitions so the sidebar persists.

import { usePagesStore, useSplitPaneStore, type SplitTarget } from '@vaultstone/store';
import { CharacterSheet } from './character-sheet/CharacterSheet';
import { EmbeddedWorldShell } from './world/EmbeddedWorldShell';
import { PagePaneContent } from './world/PagePaneContent';
import { WorldHome } from './world/WorldHome';
import { WorldMapBody } from './world/WorldMapBody';
import { WorldMapIndexBody } from './world/WorldMapIndexBody';
import { WorldRelationsBody } from './world/WorldRelationsBody';
import type { WorldEmbedTarget } from './world/WorldEmbedContext';

type Props = {
  target: SplitTarget;
};

/**
 * Shared embed-nav handler used by every world arm. The campaign
 * route is the host, so the rule is: never yank the user out of it.
 *
 *   Re-pin in the embed (return true, openSplit):
 *     - world-home, world-page: direct re-pin.
 *     - world-section: drill into the section's first page. Empty
 *       sections swallow silently — no point yanking the user out
 *       to a route that has no pages to show.
 *     - world-map-index, world-map, world-relations: each has its
 *       own SplitTarget kind now, so they re-pin in place.
 *
 *   Swallow silently (return true, no-op):
 *     - campaign: we're already inside a campaign.
 *     - app-home: a stray click on the sidebar's Vaultstone logo
 *       shouldn't yank the user away; the campaign tab strip has
 *       its own home button.
 */
function makeEmbedNav(
  worldId: string,
  openSplit: (target: SplitTarget) => void,
): (t: WorldEmbedTarget) => boolean {
  return (t) => {
    if (t.kind === 'world-home') {
      openSplit({ kind: 'world-home', worldId });
      return true;
    }
    if (t.kind === 'world-page') {
      openSplit({ kind: 'world-page', worldId, pageId: t.pageId });
      return true;
    }
    if (t.kind === 'world-section') {
      const pages = usePagesStore.getState().byWorldId[worldId] ?? [];
      const inSection = pages
        .filter((p) => p.section_id === t.sectionId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const first = inSection[0];
      if (first) {
        openSplit({ kind: 'world-page', worldId, pageId: first.id });
      }
      return true;
    }
    if (t.kind === 'world-map-index') {
      openSplit({ kind: 'world-map-index', worldId });
      return true;
    }
    if (t.kind === 'world-map') {
      openSplit({ kind: 'world-map', worldId, mapId: t.mapId });
      return true;
    }
    if (t.kind === 'world-relations') {
      openSplit({ kind: 'world-relations', worldId });
      return true;
    }
    // campaign / app-home — already inside the campaign, no-op.
    return true;
  };
}

export function SplitPaneContent({ target }: Props) {
  const closeSplitTab = useSplitPaneStore((s) => s.closeSplitTab);
  const openSplit = useSplitPaneStore((s) => s.openSplit);

  /**
   * Close this specific target wherever it lives. Walks both sides
   * and closes the matching tab. Used by embedded surfaces that
   * want to close themselves (e.g. character sheet × button).
   */
  const closeSelf = () => {
    const st = useSplitPaneStore.getState();
    const leftIdx = st.leftTabs.findIndex((t) => sameTarget(t, target));
    if (leftIdx >= 0) {
      closeSplitTab('left', leftIdx);
      return;
    }
    const rightIdx = st.rightTabs.findIndex((t) => sameTarget(t, target));
    if (rightIdx >= 0) closeSplitTab('right', rightIdx);
  };

  switch (target.kind) {
    case 'campaign':
      // Campaigns are rendered by the route directly; if one ever
      // reaches the dispatcher it's a bug, but render nothing
      // gracefully rather than crashing.
      return null;
    case 'character':
      return (
        <CharacterSheet
          characterId={target.characterId}
          embedded
          onClose={closeSelf}
        />
      );
    case 'world-page': {
      const worldId = target.worldId;
      return (
        <EmbeddedWorldShell
          worldId={worldId}
          activePageId={target.pageId}
          navigate={makeEmbedNav(worldId, openSplit)}
        >
          <PagePaneContent
            pageId={target.pageId}
            worldId={worldId}
            splitMode
            onClose={closeSelf}
            onNavigate={(targetPageId) =>
              openSplit({ kind: 'world-page', worldId, pageId: targetPageId })
            }
            onHome={() => openSplit({ kind: 'world-home', worldId })}
          />
        </EmbeddedWorldShell>
      );
    }
    case 'world-home': {
      const worldId = target.worldId;
      return (
        <EmbeddedWorldShell
          worldId={worldId}
          activePageId={null}
          navigate={makeEmbedNav(worldId, openSplit)}
        >
          <WorldHome
            worldId={worldId}
            embedded
            onClose={closeSelf}
            onNavigate={(t) => {
              // Mirrors makeEmbedNav's posture: every internal click
              // resolves inside the embed or is swallowed silently so
              // the user is never yanked out of the campaign route.
              if (t.kind === 'page') {
                openSplit({ kind: 'world-page', worldId, pageId: t.pageId });
                return true;
              }
              if (t.kind === 'section') {
                const pages = usePagesStore.getState().byWorldId[worldId] ?? [];
                const inSection = pages
                  .filter((p) => p.section_id === t.sectionId)
                  .sort((a, b) => a.sort_order - b.sort_order);
                const first = inSection[0];
                if (first) {
                  openSplit({ kind: 'world-page', worldId, pageId: first.id });
                }
                return true;
              }
              // campaign: already in a campaign, swallow.
              return true;
            }}
          />
        </EmbeddedWorldShell>
      );
    }
    case 'world-map-index': {
      const worldId = target.worldId;
      return (
        <EmbeddedWorldShell
          worldId={worldId}
          activePageId={null}
          navigate={makeEmbedNav(worldId, openSplit)}
        >
          <WorldMapIndexBody
            worldId={worldId}
            embedded
            onResolveMap={(mapId) =>
              openSplit({ kind: 'world-map', worldId, mapId })
            }
          />
        </EmbeddedWorldShell>
      );
    }
    case 'world-map': {
      const worldId = target.worldId;
      return (
        <EmbeddedWorldShell
          worldId={worldId}
          activePageId={null}
          navigate={makeEmbedNav(worldId, openSplit)}
        >
          <WorldMapBody worldId={worldId} mapId={target.mapId} embedded />
        </EmbeddedWorldShell>
      );
    }
    case 'world-relations': {
      const worldId = target.worldId;
      return (
        <EmbeddedWorldShell
          worldId={worldId}
          activePageId={null}
          navigate={makeEmbedNav(worldId, openSplit)}
        >
          <WorldRelationsBody worldId={worldId} embedded />
        </EmbeddedWorldShell>
      );
    }
  }
}

/** Local copy of the store's sameTarget for embed-side close lookups. */
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
