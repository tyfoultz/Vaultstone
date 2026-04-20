import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { listMaps, type WorldMap } from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore } from '@vaultstone/store';
import { GradientButton, Text, colors, spacing } from '@vaultstone/ui';

import { MapUploadModal } from '../../../../components/world/map/MapUploadModal';
import { PageHead } from '../../../../components/world/PageHead';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { worldMapHref } from '../../../../components/world/worldHref';

// Landing for `/world/:worldId/map` — redirect to the world's primary map
// if set, else the first non-deleted map. Otherwise render an empty state
// that lets the world owner upload the first map.
export default function WorldMapIndexScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [maps, setMaps] = useState<WorldMap[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!worldId) return;
    listMaps(worldId).then(({ data }) => setMaps((data ?? []) as WorldMap[]));
  }, [worldId]);

  if (!world || !worldId || maps === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const target = world.primary_map_id ?? maps[0]?.id ?? null;
  if (target) {
    return <Redirect href={worldMapHref(worldId, target)} />;
  }

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'chronicle', label: 'Chronicle' },
          { key: 'world', label: world.name },
          { key: 'map', label: 'Map' },
        ]}
      />
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
