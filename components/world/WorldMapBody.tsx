// Reusable world-map surface. Lifted out of
// `app/world/[worldId]/map/[mapId].tsx` so the same view can be pinned
// to the campaign split. Internal navigation (sub-map drill, pin →
// page, breadcrumb pops) consults `useWorldEmbedNavigate` first when
// embedded so the host re-pins its target instead of route-pushing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  createPin,
  deletePin,
  getMap,
  getMapImageSignedUrl,
  listMaps,
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
import { GhostButton, GradientButton, Icon, Text, colors, radius, spacing, useBreakpoint } from '@vaultstone/ui';

import { MapShareModal } from './MapShareModal';
import { MapBreadcrumbs } from './map/MapBreadcrumbs';
import { MapCanvas, type MapCanvasHandle } from './map/MapCanvas';
import { MapUploadModal } from './map/MapUploadModal';
import { PinEditorModal, type PinEditorInitial } from './map/PinEditorModal';
import { PinFilterBar } from './map/PinFilterBar';
import { PinLayer } from './map/PinLayer';
import { PinPreviewPopup } from './map/PinPreviewPopup';
import { ZoomControl } from './map/ZoomControl';
import { useWorldEmbedNavigate } from './WorldEmbedContext';
import { WorldTopBar } from './WorldTopBar';
import { worldMapHref, worldPageHref } from './worldHref';

const EMPTY_PAGES: WorldPage[] = [];

type Props = {
  worldId: string;
  mapId: string;
  embedded?: boolean;
};

export function WorldMapBody({ worldId, mapId, embedded }: Props) {
  const router = useRouter();
  const embedNavigate = useWorldEmbedNavigate();
  const { isMobile } = useBreakpoint();
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const worldPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] ?? EMPTY_PAGES : EMPTY_PAGES));

  const storedViewport = useWorldMapStackStore(
    (s) => (mapId ? s.viewportByMapId[mapId] : undefined),
  );
  const stack = useWorldMapStackStore((s) => s.stack);
  const resetStack = useWorldMapStackStore((s) => s.reset);
  const pushStack = useWorldMapStackStore((s) => s.push);
  const popStackTo = useWorldMapStackStore((s) => s.popTo);
  const replaceTopViewport = useWorldMapStackStore((s) => s.replaceTopViewport);

  const [map, setMap] = useState<WorldMap | null>(null);
  const [allMaps, setAllMaps] = useState<WorldMap[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [pinTypes, setPinTypes] = useState<PinType[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [placementMode, setPlacementMode] = useState(false);
  const [editor, setEditor] = useState<PinEditorInitial | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewPin, setPreviewPin] = useState<MapPin | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [liveScale, setLiveScale] = useState(storedViewport?.scale ?? 1);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const canvasRef = useRef<MapCanvasHandle | null>(null);

  useEffect(() => {
    if (!mapId || !worldId) return;
    let cancelled = false;
    setError('');
    setMap(null);
    setImageUrl(null);
    Promise.all([getMap(mapId), listPins(mapId), listPinTypes(), listMaps(worldId)]).then(
      async ([mapRes, pinsRes, typesRes, mapsRes]) => {
        if (cancelled) return;
        if (mapRes.error || !mapRes.data) {
          setError('Map not found or unavailable.');
          return;
        }
        const m = mapRes.data as WorldMap;
        setMap(m);
        setAllMaps((mapsRes.data ?? []) as WorldMap[]);
        setPins((pinsRes.data ?? []) as MapPin[]);
        const types = (typesRes.data ?? []) as PinType[];
        setPinTypes(types);
        setVisibleTypes(new Set(types.map((t) => t.key)));
        const signed = await getMapImageSignedUrl(m.image_key);
        if (!cancelled) setImageUrl(signed.data?.signedUrl ?? null);
        if (!cancelled) {
          const current = useWorldMapStackStore.getState().stack;
          const existingIdx = current.findIndex((e) => e.mapId === m.id);
          if (existingIdx === -1) {
            resetStack({ mapId: m.id, viewport: IDENTITY_VIEWPORT, breadcrumbLabel: m.label });
          } else if (existingIdx < current.length - 1) {
            popStackTo(existingIdx);
          }
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mapId, worldId, resetStack, popStackTo]);

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

  const handleCanvasRightClick = useCallback(
    ({ xPct, yPct }: { xPct: number; yPct: number }) => {
      if (!isOwner) return;
      setEditor({
        pin_type: 'generic',
        x_pct: xPct,
        y_pct: yPct,
        label: null,
        linked_page_id: null,
      });
      setPlacementMode(false);
    },
    [isOwner],
  );

  const handlePinPress = useCallback(
    (pin: MapPin) => {
      if (pin.linked_page_id) {
        setPreviewPin(pin);
      } else if (isOwner) {
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
      }
    },
    [isOwner],
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

  const scaleBounds = useMemo(() => {
    if (!canvasSize || !map) return null;
    const fit = Math.min(canvasSize.w / map.image_width, canvasSize.h / map.image_height);
    if (!Number.isFinite(fit) || fit <= 0) return null;
    return { min: fit, max: Math.max(fit * 4, 2) };
  }, [canvasSize, map]);

  const initialViewport = useMemo(() => {
    if (!scaleBounds) return null;
    const isUntouched =
      !storedViewport ||
      (storedViewport.scale === 1 && storedViewport.translateX === 0 && storedViewport.translateY === 0);
    if (isUntouched) {
      return { scale: scaleBounds.min, translateX: 0, translateY: 0 };
    }
    return {
      scale: Math.max(scaleBounds.min, Math.min(scaleBounds.max, storedViewport!.scale)),
      translateX: storedViewport!.translateX,
      translateY: storedViewport!.translateY,
    };
  }, [scaleBounds, storedViewport]);

  const pagesForEditor = useMemo(() => worldPages, [worldPages]);

  const visiblePageIds = useMemo(
    () => new Set(worldPages.map((p) => p.id)),
    [worldPages],
  );
  const visiblePins = useMemo(
    () => isOwner
      ? pins
      : pins.filter((p) => !p.linked_page_id || visiblePageIds.has(p.linked_page_id)),
    [pins, isOwner, visiblePageIds],
  );

  const subMapIdByPageId = useMemo(() => {
    const m = new Map<string, string>();
    for (const wm of allMaps) {
      if (wm.owner_page_id) m.set(wm.owner_page_id, wm.id);
    }
    return m;
  }, [allMaps]);

  const crumbs = useMemo(
    () => stack.map((e, i) => ({ mapId: e.mapId, label: e.breadcrumbLabel, depth: i })),
    [stack],
  );

  // Navigation helpers — route through the embed context first so a
  // sub-map drill / pin → page / breadcrumb pop re-pins the host's
  // split target. Standalone callers fall through to a route push.
  const goToMap = useCallback(
    (targetMapId: string) => {
      if (embedNavigate?.({ kind: 'world-map', worldId, mapId: targetMapId })) return;
      router.push(worldMapHref(worldId, targetMapId));
    },
    [embedNavigate, router, worldId],
  );
  const goToPage = useCallback(
    (pageId: string) => {
      if (embedNavigate?.({ kind: 'world-page', worldId, pageId })) return;
      router.push(worldPageHref(worldId, pageId));
    },
    [embedNavigate, router, worldId],
  );

  const handleOpenSubMap = useCallback(
    (targetMapId: string) => {
      if (!worldId) return;
      const target = allMaps.find((wm) => wm.id === targetMapId);
      pushStack({
        mapId: targetMapId,
        viewport: IDENTITY_VIEWPORT,
        breadcrumbLabel: target?.label ?? 'Sub-map',
      });
      setEditor(null);
      goToMap(targetMapId);
    },
    [allMaps, pushStack, goToMap, worldId],
  );

  const handleCrumbPress = useCallback(
    (crumb: { mapId: string; depth: number }) => {
      if (!worldId) return;
      popStackTo(crumb.depth);
      goToMap(crumb.mapId);
    },
    [popStackTo, goToMap, worldId],
  );

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
      {!embedded ? (
        <WorldTopBar
          crumbs={[
            { key: 'chronicle', label: 'Chronicle' },
            { key: 'world', label: world.name },
            { key: 'map', label: map.label },
          ]}
        />
      ) : null}
      <MapBreadcrumbs crumbs={crumbs} onCrumbPress={handleCrumbPress} />
      <View
        style={styles.canvasFrame}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize((prev) =>
            prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
          );
        }}
      >
        {scaleBounds && initialViewport ? (
          <MapCanvas
            ref={canvasRef}
            imageUrl={imageUrl}
            imageWidth={map.image_width}
            imageHeight={map.image_height}
            minScale={scaleBounds.min}
            maxScale={scaleBounds.max}
            initialViewport={initialViewport}
            onViewportChange={(v) => {
              setLiveScale(v.scale);
              replaceTopViewport(v);
            }}
            onCanvasClick={placementMode ? handleCanvasClick : undefined}
            onCanvasRightClick={isOwner ? handleCanvasRightClick : undefined}
            topBarExtra={isOwner ? <GhostButton label="Share" icon="share" onPress={() => setShareOpen(true)} /> : undefined}
          >
            <PinLayer
              pins={visiblePins}
              pinTypes={pinTypes}
              imageWidth={map.image_width}
              imageHeight={map.image_height}
              visibleTypes={visibleTypes}
              onPinPress={handlePinPress}
            />
          </MapCanvas>
        ) : null}

        {isMobile ? (
          <Pressable
            style={mobileMapStyles.filterBtn}
            onPress={() => setFilterMenuOpen(true)}
          >
            <Icon name="filter-list" size={20} color={colors.onSurface} />
          </Pressable>
        ) : (
          <PinFilterBar
            pinTypes={pinTypes}
            visibleTypes={visibleTypes}
            onToggle={toggleType}
            onAllToggle={toggleAll}
            allVisible={allVisible}
          />
        )}

        {!isMobile && scaleBounds ? (
          <View style={styles.zoomControl} pointerEvents="box-none">
            <ZoomControl
              scale={liveScale}
              minScale={scaleBounds.min}
              maxScale={scaleBounds.max}
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
            />
          </View>
        ) : null}

        {!isMobile && isOwner ? (
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

        {!isMobile && placementMode ? (
          <View style={styles.placementBanner} pointerEvents="none">
            <Icon name="place" size={14} color={colors.primary} />
            <Text variant="label-sm" style={{ marginLeft: 6, color: colors.onSurface }}>
              Click the map to drop a pin — or right-click anywhere, any time
            </Text>
          </View>
        ) : null}

        {previewPin && previewPin.linked_page_id ? (() => {
          const linkedPage = worldPages.find((p) => p.id === previewPin.linked_page_id);
          if (!linkedPage) return null;
          return (
            <PinPreviewPopup
              pin={previewPin}
              page={linkedPage}
              allPages={worldPages}
              isOwner={isOwner}
              onClose={() => setPreviewPin(null)}
              onOpenPage={(pageId) => {
                setPreviewPin(null);
                goToPage(pageId);
              }}
              onEditPin={() => {
                const p = previewPin;
                setPreviewPin(null);
                setEditor({
                  id: p.id,
                  pin_type: p.pin_type,
                  x_pct: p.x_pct,
                  y_pct: p.y_pct,
                  label: p.label,
                  linked_page_id: p.linked_page_id,
                  icon_key_override: p.icon_key_override,
                  color_override: p.color_override,
                });
              }}
            />
          );
        })() : null}
      </View>

      {editor ? (
        <PinEditorModal
          initial={editor}
          pinTypes={pinTypes}
          pages={pagesForEditor}
          subMapIdByPageId={subMapIdByPageId}
          onClose={() => setEditor(null)}
          onSave={handleSave}
          onDelete={editor.id ? handleDelete : undefined}
          onNavigateToLinkedPage={(pageId) => {
            setEditor(null);
            goToPage(pageId);
          }}
          onOpenSubMap={handleOpenSubMap}
        />
      ) : null}

      {uploadOpen ? (
        <MapUploadModal
          worldId={worldId}
          onClose={() => setUploadOpen(false)}
          onUploaded={(newMap) => {
            setUploadOpen(false);
            goToMap(newMap.id);
          }}
        />
      ) : null}

      {shareOpen && map ? (
        <MapShareModal
          map={map}
          onClose={() => setShareOpen(false)}
          onUpdate={(patch) => setMap((prev) => prev ? { ...prev, ...patch } : prev)}
        />
      ) : null}

      {isMobile && filterMenuOpen ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setFilterMenuOpen(false)}>
          <Pressable style={mobileMapStyles.overlayBackdrop} onPress={() => setFilterMenuOpen(false)}>
            <Pressable style={mobileMapStyles.overlayPanel} onPress={() => {}}>
              <View style={mobileMapStyles.overlayHeader}>
                <Text variant="title-sm" weight="bold" style={{ color: colors.onSurface }}>Filters & Places</Text>
                <Pressable onPress={() => setFilterMenuOpen(false)} hitSlop={8}>
                  <Icon name="close" size={20} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={mobileMapStyles.filterSection}>
                <Pressable
                  style={[mobileMapStyles.filterChip, allVisible && mobileMapStyles.filterChipActive]}
                  onPress={toggleAll}
                >
                  <Text variant="label-sm" style={{ color: allVisible ? colors.primary : colors.onSurfaceVariant }}>All</Text>
                </Pressable>
                {pinTypes.map((pt) => {
                  const active = visibleTypes.has(pt.key);
                  return (
                    <Pressable
                      key={pt.key}
                      style={[mobileMapStyles.filterChip, active && mobileMapStyles.filterChipActive]}
                      onPress={() => toggleType(pt.key)}
                    >
                      <View style={[mobileMapStyles.filterDot, { backgroundColor: pt.default_color_hex }]} />
                      <Text variant="label-sm" style={{ color: active ? colors.onSurface : colors.onSurfaceVariant }}>
                        {pt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={mobileMapStyles.pinListHeader}>
                <Text variant="label-sm" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                  ALL PLACES
                </Text>
                <Text variant="label-sm" style={{ color: colors.outlineVariant }}>
                  {visiblePins.filter((p) => visibleTypes.has(p.pin_type)).length} pins
                </Text>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {visiblePins
                  .filter((p) => visibleTypes.has(p.pin_type))
                  .map((pin) => {
                    const pt = pinTypes.find((t) => t.key === pin.pin_type);
                    return (
                      <Pressable
                        key={pin.id}
                        style={mobileMapStyles.pinRow}
                        onPress={() => {
                          setFilterMenuOpen(false);
                          handlePinPress(pin);
                        }}
                      >
                        <View style={[mobileMapStyles.pinDot, { backgroundColor: pin.color_override ?? pt?.default_color_hex ?? colors.outline }]} />
                        <View style={{ flex: 1 }}>
                          <Text variant="body-sm" style={{ color: colors.onSurface }} numberOfLines={1}>
                            {pin.label || 'Unnamed pin'}
                          </Text>
                          {pt ? (
                            <Text variant="label-sm" style={{ color: colors.onSurfaceVariant, fontSize: 10 }}>
                              {pt.label}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
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
  zoomControl: {
    position: 'absolute',
    bottom: spacing.lg + 56,
    right: spacing.lg,
    zIndex: 3,
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

const mobileMapStyles = StyleSheet.create({
  filterBtn: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh + 'DD',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayPanel: {
    backgroundColor: colors.surfaceContainerHigh,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: spacing.lg,
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  filterSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  filterChipActive: {
    borderColor: colors.primary + '66',
    backgroundColor: colors.primaryContainer + '22',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pinListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    marginTop: spacing.xs,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
