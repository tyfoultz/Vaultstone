import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getMap,
  getMapImageSignedUrl,
  listPins,
  listPinTypes,
  type MapPin,
  type PinType,
  type WorldMap,
} from '@vaultstone/api';
import {
  IDENTITY_VIEWPORT,
  useCurrentWorldStore,
  useWorldMapStackStore,
} from '@vaultstone/store';
import { Text, colors, spacing } from '@vaultstone/ui';

import { MapCanvas } from '../../../../components/world/map/MapCanvas';
import { PinLayer } from '../../../../components/world/map/PinLayer';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { worldPageHref } from '../../../../components/world/worldHref';

export default function WorldMapScreen() {
  const { worldId, mapId } = useLocalSearchParams<{ worldId: string; mapId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const savedViewport = useWorldMapStackStore(
    (s) => (mapId ? s.viewportByMapId[mapId] : undefined) ?? IDENTITY_VIEWPORT,
  );
  const resetStack = useWorldMapStackStore((s) => s.reset);
  const replaceTopViewport = useWorldMapStackStore((s) => s.replaceTopViewport);

  const [map, setMap] = useState<WorldMap | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [pinTypes, setPinTypes] = useState<PinType[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mapId) return;
    let cancelled = false;
    Promise.all([getMap(mapId), listPins(mapId), listPinTypes()]).then(
      async ([mapRes, pinsRes, typesRes]) => {
        if (cancelled) return;
        if (mapRes.error || !mapRes.data) {
          setError('Map not found or unavailable.');
          return;
        }
        const m = mapRes.data as WorldMap;
        setMap(m);
        setPins((pinsRes.data ?? []) as MapPin[]);
        setPinTypes((typesRes.data ?? []) as PinType[]);
        const signed = await getMapImageSignedUrl(m.image_key);
        if (!cancelled) setImageUrl(signed.data?.signedUrl ?? null);
        // Cold-land: seed the drill stack with this map so sub-map back works.
        if (!cancelled) {
          resetStack({ mapId: m.id, viewport: IDENTITY_VIEWPORT, breadcrumbLabel: m.label });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mapId, resetStack]);

  if (!world || !worldId) return null;

  if (error) {
    return (
      <View style={styles.centered}>
        <Text variant="body-md" style={{ color: colors.hpDanger }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!map || !imageUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'chronicle', label: 'Chronicle' },
          { key: 'world', label: world.name },
          { key: 'map', label: map.label },
        ]}
      />
      <MapCanvas
        imageUrl={imageUrl}
        imageWidth={map.image_width}
        imageHeight={map.image_height}
        initialViewport={savedViewport}
        onViewportChange={replaceTopViewport}
      >
        <PinLayer
          pins={pins}
          pinTypes={pinTypes}
          imageWidth={map.image_width}
          imageHeight={map.image_height}
          onPinPress={(pin) => {
            if (pin.linked_page_id) {
              router.push(worldPageHref(worldId, pin.linked_page_id));
            }
          }}
        />
      </MapCanvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
});
