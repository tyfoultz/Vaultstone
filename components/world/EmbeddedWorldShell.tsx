// Wraps the world sidebar around an embedded world surface (world
// home or a world page) inside a host pane such as the campaign
// split shell. Matches the standalone world `_layout.tsx` posture
// (sidebar left, content right) while threading the embed-aware
// navigation context so internal links re-pin the host's split
// target instead of leaving the route.
//
// The sidebar's existing modals, drag/drop, search, and CRUD all
// work unchanged — only navigation is intercepted.

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  getCampaignsForWorld,
  getPagesForWorld,
  getSectionsForWorld,
  getWorld,
} from '@vaultstone/api';
import {
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database, WorldPage, WorldSection } from '@vaultstone/types';

import { ActiveSectionProvider } from './ActiveSectionContext';
import { WorldSidebar } from './WorldSidebar';
import { WorldEmbedProvider, type WorldEmbedNavigate } from './WorldEmbedContext';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  worldId: string;
  activePageId: string | null;
  navigate: WorldEmbedNavigate;
  children: React.ReactNode;
};

export function EmbeddedWorldShell({ worldId, activePageId, navigate, children }: Props) {
  // Same hydration shape WorldHome's embedded path uses — pull the
  // world / sections / pages / linked campaigns into the shared
  // Zustand stores so the sidebar (and any nested page-tree views)
  // see populated data. Idempotent: re-running with the same worldId
  // re-fetches and overwrites the slice for that world, which is
  // fine since these tables are not mutated mid-render.
  const session = useAuthStore((s) => s.session);
  const world = useCurrentWorldStore((s) => s.world);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const setLinkedCampaigns = useCurrentWorldStore((s) => s.setLinkedCampaigns);
  const setSections = useSectionsStore((s) => s.setSectionsForWorld);
  const setPages = usePagesStore((s) => s.setPagesForWorld);
  const [resolvedWorld, setResolvedWorld] = useState<World | null>(
    world && world.id === worldId ? world : null,
  );

  useEffect(() => {
    if (!session || !worldId) return;
    let cancelled = false;
    Promise.all([
      getWorld(worldId),
      getSectionsForWorld(worldId),
      getPagesForWorld(worldId),
      getCampaignsForWorld(worldId),
    ]).then(([worldRes, sectionsRes, pagesRes, campaignsRes]) => {
      if (cancelled) return;
      if (worldRes.error || !worldRes.data) return;
      const w = worldRes.data as World;
      setActiveWorld(w);
      setResolvedWorld(w);
      setSections(worldId, (sectionsRes.data ?? []) as WorldSection[]);
      setPages(worldId, (pagesRes.data ?? []) as unknown as WorldPage[]);
      const linked = (
        (campaignsRes.data ?? []) as unknown as Array<{
          campaigns: Database['public']['Tables']['campaigns']['Row'] | null;
        }>
      )
        .map((row) => row.campaigns)
        .filter((c): c is Database['public']['Tables']['campaigns']['Row'] => !!c);
      setLinkedCampaigns(linked);
    });
    return () => { cancelled = true; };
  }, [session, worldId, setActiveWorld, setLinkedCampaigns, setSections, setPages]);

  return (
    <WorldEmbedProvider value={navigate}>
      <ActiveSectionProvider initialSectionId={null}>
        <View style={styles.root}>
          {resolvedWorld ? (
            <WorldSidebar world={resolvedWorld} activePageId={activePageId} />
          ) : (
            <View style={styles.sidebarPlaceholder} />
          )}
          <View style={styles.content}>{children}</View>
        </View>
      </ActiveSectionProvider>
    </WorldEmbedProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surfaceCanvas,
    minHeight: 0,
  },
  // While the world is still loading we reserve sidebar width so the
  // content doesn't jump when it lands. Matches WorldSidebar's
  // expanded width.
  sidebarPlaceholder: {
    width: 260,
    backgroundColor: colors.surfaceContainerLow,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '33',
  },
  content: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
    minWidth: 0,
  },
});
