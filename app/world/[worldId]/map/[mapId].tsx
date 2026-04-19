import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createPin,
  deletePin,
  getMap,
  getMapImageSignedUrl,
  listPins,
  listPinTypes,
  updatePin,
  type MapPin,
  type PinType,
  type WorldMap,
} from '@vaultstone/api';
import {
  IDENTITY_VIEWPORT,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useWorldMapStackStore,
} from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';
import { GhostButton, GradientButton, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { MapCanvas } from '../../../../components/world/map/MapCanvas';
import { MapUploadModal } from '../../../../components/world/map/MapUploadModal';
import { PinEditorModal, type PinEditorInitial } from '../../../../components/world/map/PinEditorModal';
import { PinFilterBar } from '../../../../components/world/map/PinFilterBar';
import { PinLayer } from '../../../../components/world/map/PinLayer';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { worldPageHref } from '../../../../components/world/worldHref';

const EMPTY_PAGES: WorldPage[] = [];

export default function WorldMapScreen() {
  const { worldId, mapId } = useLocalSearchParams<{ worldId: string; mapId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const worldPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] ?? EMPTY_PAGES : EMPTY_PAGES));

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
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [placementMode, setPlacementMode] = useState(false);
  const [editor, setEditor] = useState<PinEditorInitial | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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
        const types = (typesRes.data ?? []) as PinType[];
        setPinTypes(types);
        setVisibleTypes(new Set(types.map((t) => t.key)));
        const signed = await getMapImageSignedUrl(m.image_key);
        if (!cancelled) setImageUrl(signed.data?.signedUrl ?? null);
        if (!cancelled) {
          resetStack({ mapId: m.id, viewport: IDENTITY_VIEWPORT, breadcrumbLabel: m.label });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mapId, resetStack]);

  const toggleType = useCallback((key: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setVisibleTypes((prev) => {
      if (prev.size === pinTypes.length) return new Set<string>();
      return new Set(pinTypes.map((t) => t.key));
    });
  }, [pinTypes]);

  const allVisible = visibleTypes.size === pinTypes.length && pinTypes.length > 0;

  const handleCanvasClick = useCallback(
    ({ xPct, yPct }: { xPct: number; yPct: number }) => {
      if (!placementMode) return;
      setEditor({
        pin_type: 'generic',
        x_pct: xPct,
        y_pct: yPct,
        label: null,
        linked_page_id: null,
      });
      setPlacementMode(false);
    },
    [placementMode],
  );

  const handlePinPress = useCallback(
    (pin: MapPin) => {
      if (isOwner) {
        setEditor({
          id: pin.id,
          pin_type: pin.pin_type,
          x_pct: pin.x_pct,
          y_pct: pin.y_pct,
          label: pin.label,
          linked_page_id: pin.linked_page_id,
          icon_key_override: pin.icon_key_override,
          color_override: pin.color_override,
        });
      } else if (pin.linked_page_id && worldId) {
        router.push(worldPageHref(worldId, pin.linked_page_id));
      }
    },
    [isOwner, router, worldId],
  );

  const handleSave = useCallback(
    async (patch: { pin_type: string; label: string | null; linked_page_id: string | null }) => {
      if (!editor || !mapId || !worldId) return;
      if (editor.id) {
        const { data, error: err } = await updatePin(editor.id, patch);
        if (err || !data) throw new Error(err?.message ?? 'Update failed');
        setPins((prev) => prev.map((p) => (p.id === data.id ? (data as MapPin) : p)));
      } else {
        const { data, error: err } = await createPin({
          map_id: mapId,
          world_id: worldId,
          pin_type: patch.pin_type,
          x_pct: editor.x_pct,
          y_pct: editor.y_pct,
          label: patch.label,
          linked_page_id: patch.linked_page_id,
        });
        if (err || !data) throw new Error(err?.message ?? 'Create failed');
        setPins((prev) => [...prev, data as MapPin]);
      }
    },
    [editor, mapId, worldId],
  );

  const handleDelete = useCallback(async () => {
    if (!editor?.id) return;
    const { error: err } = await deletePin(editor.id);
    if (err) throw new Error(err.message);
    setPins((prev) => prev.filter((p) => p.id !== editor.id));
  }, [editor]);

  const pagesForEditor = useMemo(() => worldPages, [worldPages]);

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
      <View style={styles.canvasFrame}>
        <MapCanvas
          imageUrl={imageUrl}
          imageWidth={map.image_width}
          imageHeight={map.image_height}
          initialViewport={savedViewport}
          onViewportChange={replaceTopViewport}
          onCanvasClick={placementMode ? handleCanvasClick : undefined}
        >
          <PinLayer
            pins={pins}
            pinTypes={pinTypes}
            imageWidth={map.image_width}
            imageHeight={map.image_height}
            visibleTypes={visibleTypes}
            onPinPress={handlePinPress}
          />
        </MapCanvas>

        <PinFilterBar
          pinTypes={pinTypes}
          visibleTypes={visibleTypes}
          onToggle={toggleType}
          onAllToggle={toggleAll}
          allVisible={allVisible}
        />

        {isOwner ? (
          <View style={styles.toolbar} pointerEvents="box-none">
            <GhostButton label="Upload map" onPress={() => setUploadOpen(true)} />
            {placementMode ? (
              <GhostButton label="Cancel placement" onPress={() => setPlacementMode(false)} />
            ) : (
              <GradientButton
                label="+ Pin"
                onPress={() => setPlacementMode(true)}
              />
            )}
          </View>
        ) : null}

        {placementMode ? (
          <View style={styles.placementBanner} pointerEvents="none">
            <Icon name="place" size={14} color={colors.primary} />
            <Text variant="label-sm" style={{ marginLeft: 6, color: colors.onSurface }}>
              Tap the map to drop a pin
            </Text>
          </View>
        ) : null}
      </View>

      {editor ? (
        <PinEditorModal
          initial={editor}
          pinTypes={pinTypes}
          pages={pagesForEditor}
          onClose={() => setEditor(null)}
          onSave={handleSave}
          onDelete={editor.id ? handleDelete : undefined}
          onNavigateToLinkedPage={(pageId) => {
            setEditor(null);
            router.push(worldPageHref(worldId, pageId));
          }}
        />
      ) : null}

      {uploadOpen ? (
        <MapUploadModal
          worldId={worldId}
          onClose={() => setUploadOpen(false)}
          onUploaded={(newMap) => {
            setUploadOpen(false);
            router.push(`/world/${worldId}/map/${newMap.id}`);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  canvasFrame: { flex: 1, position: 'relative' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  toolbar: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    zIndex: 3,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  placementBanner: {
    position: 'absolute',
    top: spacing.md + 44,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    zIndex: 3,
  },
});
