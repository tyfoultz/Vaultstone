// Reusable world-relations surface. Lifted out of the standalone
// `app/world/[worldId]/relations.tsx` route so the same view can be
// pinned to the campaign split. Behavior matches the route variant —
// page opens go through `useWorldEmbedNavigate` when present so the
// host can re-target its pane instead of route-pushing.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { updatePage } from '@vaultstone/api';
import { useCurrentWorldStore, usePagesStore } from '@vaultstone/store';
import type { PageKind, WorldPage } from '@vaultstone/types';
import { colors, spacing, useBreakpoint } from '@vaultstone/ui';

import { MobileNodeDetailCard } from './relation-web/MobileNodeDetailCard';
import { NodeDetailCard } from './relation-web/NodeDetailCard';
import { RelationFilterBar } from './relation-web/RelationFilterBar';
import { RelationWeb } from './relation-web/RelationWeb';
import { useRelationGraph } from './relation-web/useRelationGraph';
import type { EdgeSource, RelationEdge } from './relation-web/constants';
import { useWorldEmbedNavigate } from './WorldEmbedContext';
import { WorldTopBar } from './WorldTopBar';
import { worldPageHref } from './worldHref';

const EMPTY_PAGES: WorldPage[] = [];

type Props = {
  worldId: string;
  /** When true, suppresses the WorldTopBar — the embed host renders
   *  its own chrome above the body and the crumb labels collide with
   *  the campaign tab strip otherwise. */
  embedded?: boolean;
};

export function WorldRelationsBody({ worldId, embedded }: Props) {
  const router = useRouter();
  const embedNavigate = useWorldEmbedNavigate();
  const world = useCurrentWorldStore((s) => s.world);
  const worldPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] ?? EMPTY_PAGES : EMPTY_PAGES));

  const { nodes, edges, nodeById, hiddenPages } = useRelationGraph(worldId);
  const storeUpdatePage = usePagesStore((s) => s.updatePage);

  const availableKinds = useMemo(() => {
    const kindSet = new Set<PageKind>();
    for (const n of nodes) kindSet.add(n.pageKind);
    const order: PageKind[] = ['npc', 'location', 'faction', 'organization', 'religion', 'lore', 'timeline', 'item', 'pc_stub', 'player_character', 'custom'];
    return order.filter((k) => kindSet.has(k));
  }, [nodes]);

  const [visibleKinds, setVisibleKinds] = useState<Set<string>>(() => new Set(availableKinds));
  const [visibleEdgeSources, setVisibleEdgeSources] = useState<Set<EdgeSource>>(
    () => new Set<EdgeSource>(['manual', 'structural', 'mention']),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of availableKinds) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availableKinds]);

  const toggleKind = useCallback((kind: string) => {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const toggleEdgeSource = useCallback((source: EdgeSource) => {
    setVisibleEdgeSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedPage = selectedNodeId ? worldPages.find((p) => p.id === selectedNodeId) ?? null : null;

  const connectedEdges = useMemo<RelationEdge[]>(() => {
    if (!selectedNodeId) return [];
    return edges.filter(
      (e) =>
        (e.sourceId === selectedNodeId || e.targetId === selectedNodeId) &&
        visibleEdgeSources.has(e.edgeSource),
    );
  }, [selectedNodeId, edges, visibleEdgeSources]);

  const setPageHidden = useCallback(
    (pageId: string, hidden: boolean) => {
      const page = worldPages.find((p) => p.id === pageId);
      if (!page) return;
      const sf = ((page.structured_fields as Record<string, unknown>) ?? {});
      const nextSf = { ...sf, __hidden_from_relation_web: hidden || undefined };
      if (!hidden) delete nextSf.__hidden_from_relation_web;
      storeUpdatePage(pageId, { structured_fields: nextSf as any });
      void updatePage(pageId, { structured_fields: nextSf as any });
    },
    [worldPages, storeUpdatePage],
  );

  const handleHideNode = useCallback(
    (nodeId: string) => setPageHidden(nodeId, true),
    [setPageHidden],
  );

  const handleUnhidePage = useCallback(
    (pageId: string) => setPageHidden(pageId, false),
    [setPageHidden],
  );

  const handleOpenPage = useCallback(
    (pageId: string) => {
      if (!worldId) return;
      if (embedNavigate?.({ kind: 'world-page', worldId, pageId })) return;
      router.push(worldPageHref(worldId, pageId));
    },
    [worldId, router, embedNavigate],
  );

  const { isMobile } = useBreakpoint();

  if (!world || !worldId) return null;

  return (
    <View style={styles.root}>
      {!embedded ? (
        <WorldTopBar
          crumbs={[
            { key: 'chronicle', label: 'Chronicle' },
            { key: 'world', label: world.name },
            { key: 'relations', label: 'Relationship Web' },
          ]}
        />
      ) : null}

      <RelationFilterBar
        visibleKinds={visibleKinds}
        visibleEdgeSources={visibleEdgeSources}
        availableKinds={availableKinds}
        onToggleKind={toggleKind}
        onToggleEdgeSource={toggleEdgeSource}
        hiddenPages={hiddenPages}
        onUnhidePage={handleUnhidePage}
      />

      <View
        style={styles.graphFrame}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setContainerSize((prev) =>
            prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
          );
        }}
      >
        {containerSize ? (
          <RelationWeb
            nodes={nodes}
            edges={edges}
            nodeById={nodeById}
            visibleKinds={visibleKinds}
            visibleEdgeSources={visibleEdgeSources}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onDoubleClickNode={handleOpenPage}
            onHideNode={handleHideNode}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
          />
        ) : null}

        {selectedNode && selectedPage ? (
          isMobile ? (
            <MobileNodeDetailCard
              node={selectedNode}
              worldId={worldId}
              connectionCount={connectedEdges.length}
              onDismiss={() => setSelectedNodeId(null)}
            />
          ) : (
            <View style={styles.detailOverlay} pointerEvents="box-none">
              <NodeDetailCard
                node={selectedNode}
                page={selectedPage}
                connectedEdges={connectedEdges}
                nodeById={nodeById}
                worldId={worldId}
                onClose={() => setSelectedNodeId(null)}
                onOpenPage={handleOpenPage}
              />
            </View>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  graphFrame: { flex: 1, position: 'relative' },
  detailOverlay: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
  },
});
