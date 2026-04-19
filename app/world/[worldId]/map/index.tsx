import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { listMaps, type WorldMap } from '@vaultstone/api';
import { useCurrentWorldStore } from '@vaultstone/store';
import { Text, colors, spacing } from '@vaultstone/ui';

import { PageHead } from '../../../../components/world/PageHead';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { worldMapHref } from '../../../../components/world/worldHref';

// Landing for `/world/:worldId/map` — redirect to the world's primary map
// if set, else the first non-deleted map. Otherwise render an empty state.
export default function WorldMapIndexScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const world = useCurrentWorldStore((s) => s.world);
  const [maps, setMaps] = useState<WorldMap[] | null>(null);

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
      </View>
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
