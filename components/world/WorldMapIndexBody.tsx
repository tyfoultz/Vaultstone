// Reusable world-map landing surface. Lifted out of
// `app/world/[worldId]/map/index.tsx` so the same view can be pinned
// to the campaign split. When a map exists the standalone route
// returns <Redirect>, which doesn't work inside an embed; the
// `onResolveMap` callback fires with the resolved map id so the host
// can re-pin to a `world-map` target instead.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { listMaps, type WorldMap } from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore } from '@vaultstone/store';
import { GradientButton, Text, colors, spacing } from '@vaultstone/ui';

import { MapUploadModal } from './map/MapUploadModal';
import { PageHead } from './PageHead';
import { useWorldEmbedNavigate } from './WorldEmbedContext';
import { WorldTopBar } from './WorldTopBar';
import { worldMapHref } from './worldHref';

type Props = {
  worldId: string;
  embedded?: boolean;
  /** When an embedded host has a way to swap targets, this fires
   *  with the resolved map id so the host can re-pin to `world-map`
   *  rather than route-redirecting. Returns nothing — the host is
   *  expected to call `openSplit` (or equivalent) synchronously. */
  onResolveMap?: (mapId: string) => void;
};

export function WorldMapIndexBody({ worldId, embedded, onResolveMap }: Props) {
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [maps, setMaps] = useState<WorldMap[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();
  const embedNavigate = useWorldEmbedNavigate();

  useEffect(() => {
    if (!worldId) return;
    listMaps(worldId).then(({ data }) => setMaps((data ?? []) as WorldMap[]));
  }, [worldId]);

  useEffect(() => {
    if (!world || !worldId || maps === null) return;
    const target = world.primary_map_id ?? maps[0]?.id ?? null;
    if (!target) return;
    if (onResolveMap) {
      onResolveMap(target);
    } else if (!embedded) {
      // Standalone parity with the original route: hop to the map.
      router.replace(worldMapHref(worldId, target));
    }
  }, [world, worldId, maps, onResolveMap, embedded, router]);

  if (!world || !worldId || maps === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Still computing the redirect target — render a transient spinner so
  // the empty state doesn't flash before we know there's no map.
  const target = world.primary_map_id ?? maps[0]?.id ?? null;
  if (target) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {!embedded ? (
        <WorldTopBar
          crumbs={[
            { key: 'chronicle', label: 'Chronicle' },
            { key: 'world', label: world.name },
            { key: 'map', label: 'Map' },
          ]}
        />
      ) : null}
      <View style={styles.empty}>
        <PageHead icon="map-pin" title="No maps yet" meta="Atlas" accentToken="primary" />
        <Text variant="body-md" tone="secondary" style={{ marginTop: spacing.md }}>
          Upload your first map to place pins, nest sub-maps, and link pages.
        </Text>
        {isOwner ? (
          <View style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}>
            <GradientButton label="Upload map" onPress={() => setUploadOpen(true)} />
          </View>
        ) : null}
      </View>

      {uploadOpen ? (
        <MapUploadModal
          worldId={worldId}
          onClose={() => setUploadOpen(false)}
          onUploaded={(newMap) => {
            setUploadOpen(false);
            if (embedNavigate?.({ kind: 'world-map', worldId, mapId: newMap.id })) return;
            router.push(worldMapHref(worldId, newMap.id));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  empty: { padding: spacing.xl, maxWidth: 520 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
});
