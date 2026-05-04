import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getPage, listMaps, reorderMaps, reorderSections, softDeleteMap, updateMap, updateWorld, uploadWorldThumbnail, type WorldMap } from '@vaultstone/api';
import { pinPageToPrep } from './SessionPrepPanel';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
  useSidebarCollapseStore,
  useWorldsStore,
} from '@vaultstone/store';
import type { Database, WorldSection } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  ImageCropModal,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { CreatePageModal } from './CreatePageModal';
import { CreateSectionModal } from './CreateSectionModal';
import { RecentlyDeletedModal } from './RecentlyDeletedModal';
import { LensDropdown } from './LensDropdown';
import { MapUploadModal } from './map/MapUploadModal';
import { useMapDnd } from './useMapDnd';
import { isSectionVisibleToPlayersPreview } from './playerViewFilters';
import { SidebarDndProvider } from './SidebarDndContext';
import { SidebarSection } from './SidebarSection';
import { WorldSearchDrawer } from './WorldSearchDrawer';
import { WorldSettingsModal } from './WorldSettingsModal';
import { worldHref, worldMapHref, worldMapIndexHref, worldPageHref, worldRelationsHref } from './worldHref';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  world: World;
  activePageId?: string | null;
};

export function WorldSidebar({ world, activePageId }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const allSections = useSectionsStore((s) => selectSectionsForWorld(s, world.id));
  const playerView = useCurrentWorldStore((s) => s.playerViewPreview);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const storeUpdateWorld = useWorldsStore((s) => s.updateWorld);
  const sidebarOpen = useSidebarCollapseStore((s) => s.sidebarOpen);
  const toggleSidebar = useSidebarCollapseStore((s) => s.toggleSidebar);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageTarget, setCreatePageTarget] = useState<{
    sectionId: string;
    parentPageId?: string | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [maps, setMaps] = useState<WorldMap[]>([]);
  const [mapUploadOpen, setMapUploadOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const pathname = usePathname();

  const isOwner = !!(user && user.id === world.owner_user_id);
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const allPages = usePagesStore((s) => s.byWorldId[world.id]);
  const updatePageInStore = usePagesStore((s) => s.updatePage);

  const handlePinToPrep = useCallback(async (pageId: string) => {
    const campaign = linkedCampaigns.find((c) => (c as any).next_session_prep_page_id);
    if (!campaign) return;
    const prepPageId = (campaign as any).next_session_prep_page_id as string;
    const prepPage = allPages?.find((p) => p.id === prepPageId);
    if (!prepPage) {
      const { data } = await getPage(prepPageId);
      if (!data) return;
      const newFields = await pinPageToPrep(data as any, pageId);
      updatePageInStore(prepPageId, { structured_fields: newFields });
    } else {
      const newFields = await pinPageToPrep(prepPage, pageId);
      updatePageInStore(prepPageId, { structured_fields: newFields });
    }
  }, [linkedCampaigns, allPages, updatePageInStore]);

  useEffect(() => {
    listMaps(world.id).then(({ data }) => setMaps((data ?? []) as WorldMap[]));
  }, [world.id]);

  async function handleUploadThumbnail(uri: string, mime: string) {
    setUploading(true);
    const { url } = await uploadWorldThumbnail(world.id, uri, mime);
    setUploading(false);
    if (url) {
      storeUpdateWorld(world.id, { thumbnail_url: url });
      setActiveWorld({ ...world, thumbnail_url: url });
    }
  }

  async function handlePickThumbnail() {
    const isWeb = Platform.OS === 'web';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !isWeb,
      aspect: [16, 10],
      quality: 0.5,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (isWeb) {
      setCropUri(asset.uri);
    } else {
      await handleUploadThumbnail(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }

  async function handleCropConfirm(croppedUri: string) {
    setCropUri(null);
    await handleUploadThumbnail(croppedUri, 'image/jpeg');
  }

  const visibleSections = useMemo(() => {
    return playerView
      ? allSections.filter(isSectionVisibleToPlayersPreview)
      : allSections;
  }, [allSections, playerView]);

  const storeUpdateSection = useSectionsStore((s) => s.updateSection);
  const handleSectionReorder = useCallback(
    (dragged: WorldSection, target: WorldSection, position: 'before' | 'after') => {
      if (dragged.id === target.id) return;
      const ordered = [...allSections].sort((a, b) => a.sort_order - b.sort_order);
      const without = ordered.filter((s) => s.id !== dragged.id);
      const targetIdx = without.findIndex((s) => s.id === target.id);
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      without.splice(insertIdx, 0, dragged);
      const updates = without.map((s, i) => ({ id: s.id, sort_order: i }));
      for (const u of updates) storeUpdateSection(u.id, { sort_order: u.sort_order });
      void reorderSections(updates);
    },
    [allSections, storeUpdateSection],
  );

  // ── Collapsed rail mode ──────────────────────────────────────────────
  if (!sidebarOpen) {
    return (
      <View style={styles.collapsedRoot}>
        <Pressable
          onPress={toggleSidebar}
          style={styles.collapsedItem}
          accessibilityLabel="Expand sidebar"
        >
          <Icon name="menu" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(drawer)/home')}
          style={styles.collapsedItem}
          accessibilityLabel="Vaultstone home"
        >
          <LinearGradient
            colors={[colors.primaryContainer, colors.secondaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.collapsedLogo}
          >
            <Icon name="diamond" size={14} color={colors.onPrimary} />
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => router.push(worldHref(world.id))}
          style={styles.collapsedItem}
          accessibilityLabel="World home"
        >
          <Icon name="home" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        <Pressable
          onPress={() => router.push(worldMapIndexHref(world.id))}
          style={styles.collapsedItem}
          accessibilityLabel="Map"
        >
          <Icon name="map" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        <Pressable
          onPress={() => router.push(worldRelationsHref(world.id))}
          style={styles.collapsedItem}
          accessibilityLabel="Relationship web"
        >
          <Icon name="hub" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        {world.primary_timeline_page_id ? (
          <Pressable
            onPress={() =>
              router.push(worldPageHref(world.id, world.primary_timeline_page_id!))
            }
            style={styles.collapsedItem}
            accessibilityLabel="Timeline"
          >
            <Icon name="timeline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => setSettingsOpen(true)}
          style={styles.collapsedItem}
          accessibilityLabel="World settings"
        >
          <Icon name="settings" size={20} color={colors.onSurfaceVariant} />
        </Pressable>

        {settingsOpen ? (
          <WorldSettingsModal world={world} onClose={() => setSettingsOpen(false)} />
        ) : null}
      </View>
    );
  }

  // ── Expanded sidebar ─────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Top bar: hamburger + home + world home */}
      <View style={styles.topBar}>
        <Pressable
          onPress={toggleSidebar}
          style={styles.topBarBtn}
          accessibilityLabel="Collapse sidebar"
        >
          <Icon name="menu-open" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/(drawer)/home')}
          accessibilityLabel="Vaultstone home"
        >
          <LinearGradient
            colors={[colors.primaryContainer, colors.secondaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topBarLogo}
          >
            <Icon name="diamond" size={12} color={colors.onPrimary} />
          </LinearGradient>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push(worldHref(world.id))}
          style={styles.topBarBtn}
          accessibilityLabel="World home"
        >
          <Icon name="home" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldMapIndexHref(world.id))}
          style={styles.topBarBtn}
          accessibilityLabel="Map"
        >
          <Icon name="map" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldRelationsHref(world.id))}
          style={styles.topBarBtn}
          accessibilityLabel="Relationship web"
        >
          <Icon name="hub" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
        {world.primary_timeline_page_id ? (
          <Pressable
            onPress={() =>
              router.push(worldPageHref(world.id, world.primary_timeline_page_id!))
            }
            style={styles.topBarBtn}
            accessibilityLabel="Timeline"
          >
            <Icon name="timeline" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={
          world.thumbnail_url
            ? () => router.push(worldHref(world.id))
            : isOwner
              ? handlePickThumbnail
              : undefined
        }
        disabled={uploading || (!world.thumbnail_url && !isOwner)}
        style={styles.cover}
      >
        {world.thumbnail_url ? (
          <Image source={{ uri: world.thumbnail_url }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[colors.primaryContainer, colors.secondaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.coverPlaceholder}>
              {isOwner && !uploading ? (
                <Icon name="add-a-photo" size={24} color={colors.onPrimary} />
              ) : (
                <Icon name="public" size={28} color={colors.onPrimary} />
              )}
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.coverGradient}
        >
          <Text
            variant="title-md"
            family="serif-display"
            weight="bold"
            numberOfLines={2}
            style={{ color: '#fff', letterSpacing: -0.25 }}
          >
            {world.name}
          </Text>
        </LinearGradient>
        {uploading ? (
          <View style={styles.coverUploadingOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </Pressable>

      <WorldSearchDrawer worldId={world.id} />

      <SidebarDndProvider>
      <ScrollView style={styles.tree} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}>
        {visibleSections.length === 0 ? (
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.lg }}
          >
            No sections yet.
          </Text>
        ) : (
          visibleSections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              worldId={world.id}
              activePageId={activePageId}
              onAddPage={() => setCreatePageTarget({ sectionId: section.id })}
              onAddSubPage={(sectionId, parentPageId) =>
                setCreatePageTarget({ sectionId, parentPageId })
              }
              onReorder={handleSectionReorder}
              onPinToPrep={isOwner ? handlePinToPrep : undefined}
            />
          ))
        )}
        <SidebarMapSection
          maps={maps}
          setMaps={setMaps}
          worldId={world.id}
          primaryMapId={world.primary_map_id}
          activeMapId={pathname.match(/\/world\/[^/]+\/map\/([^/]+)/)?.[1] ?? null}
          isOwner={isOwner}
          onAddMap={() => setMapUploadOpen(true)}
          onSetPrimary={(mapId) => {
            storeUpdateWorld(world.id, { primary_map_id: mapId });
            setActiveWorld({ ...world, primary_map_id: mapId });
          }}
        />
      </ScrollView>
      </SidebarDndProvider>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <GhostButton
              label="+ New section"
              onPress={() => setCreateSectionOpen(true)}
            />
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [
              styles.gearBtn,
              pressed && { backgroundColor: colors.surfaceContainerHigh },
            ]}
            accessibilityLabel="World settings"
          >
            <Icon name="settings" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      {settingsOpen ? (
        <WorldSettingsModal world={world} onClose={() => setSettingsOpen(false)} />
      ) : null}
      <RecentlyDeletedModal visible={trashOpen} worldId={world.id} onClose={() => setTrashOpen(false)} />
      {createSectionOpen ? (
        <CreateSectionModal
          worldId={world.id}
          onClose={() => setCreateSectionOpen(false)}
        />
      ) : null}
      {createPageTarget ? (
        <CreatePageModal
          worldId={world.id}
          sectionId={createPageTarget.sectionId}
          parentPageId={createPageTarget.parentPageId ?? null}
          onClose={() => setCreatePageTarget(null)}
        />
      ) : null}
      {mapUploadOpen ? (
        <MapUploadModal
          worldId={world.id}
          onClose={() => setMapUploadOpen(false)}
          onUploaded={(newMap) => {
            setMapUploadOpen(false);
            setMaps((prev) => [...prev, newMap]);
            router.push(worldMapHref(world.id, newMap.id));
          }}
        />
      ) : null}
      {cropUri ? (
        <ImageCropModal
          visible
          imageUri={cropUri}
          aspect={[16, 10]}
          usageHint="This image appears as the sidebar cover (16:10) with your world name overlaid."
          onConfirm={handleCropConfirm}
          onCancel={() => setCropUri(null)}
        />
      ) : null}
    </View>
  );
}

function SidebarMapRow({ map, worldId, active, isPrimary, onContextMenu, onDrop }: {
  map: WorldMap;
  worldId: string;
  active: boolean;
  isPrimary: boolean;
  onContextMenu: (anchor: { x: number; y: number }) => void;
  onDrop: (dragged: WorldMap, target: WorldMap, position: 'before' | 'after') => void;
}) {
  const router = useRouter();
  const { ref, isDragging, dropPosition, isOver } = useMapDnd(map, onDrop);

  const dropLine = isOver && dropPosition ? (
    <View style={[mapSectionStyles.dropLine, dropPosition === 'before' ? { marginBottom: -1 } : { marginTop: -1 }]} />
  ) : null;

  return (
    <View
      ref={ref as React.RefObject<View>}
      // @ts-expect-error -- RN Web supports onContextMenu on View
      onContextMenu={(e: { nativeEvent: { pageX: number; pageY: number }; preventDefault?: () => void }) => {
        if (e.preventDefault) e.preventDefault();
        onContextMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      }}
      style={[{ position: 'relative' }, isDragging && { opacity: 0.4 }]}
    >
      {dropPosition === 'before' && dropLine}
      <Pressable
        onPress={() => router.push(worldMapHref(worldId, map.id))}
        style={[mapSectionStyles.mapRow, active && mapSectionStyles.mapRowActive]}
      >
        <Icon
          name={isPrimary ? 'star' : 'map'}
          size={14}
          color={active ? colors.primary : isPrimary ? colors.cosmic : colors.onSurfaceVariant}
        />
        <Text
          variant="body-sm"
          numberOfLines={1}
          style={{ flex: 1, color: active ? colors.primary : colors.onSurface, fontSize: 13 }}
        >
          {map.label || 'Untitled map'}
        </Text>
      </Pressable>
      {dropPosition === 'after' && dropLine}
    </View>
  );
}

function SidebarMapSection({ maps, setMaps, worldId, primaryMapId, activeMapId, isOwner, onAddMap, onSetPrimary }: {
  maps: WorldMap[];
  setMaps: React.Dispatch<React.SetStateAction<WorldMap[]>>;
  worldId: string;
  primaryMapId: string | null;
  activeMapId: string | null;
  isOwner: boolean;
  onAddMap: () => void;
  onSetPrimary: (mapId: string | null) => void;
}) {
  const router = useRouter();
  const collapseKey = `${worldId}:__maps`;
  const collapsed = useSidebarCollapseStore((s) => !!s.collapsed[collapseKey]);
  const toggle = useSidebarCollapseStore((s) => s.toggle);
  const [menuState, setMenuState] = useState<{ map: WorldMap; anchor: { x: number; y: number } } | null>(null);
  const [renameMap, setRenameMap] = useState<WorldMap | null>(null);

  async function handleRenameMap(map: WorldMap, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === map.label) return;
    setMaps((prev) => prev.map((m) => m.id === map.id ? { ...m, label: trimmed } : m));
    await updateMap(map.id, { label: trimmed });
  }

  async function handleDeleteMap(map: WorldMap) {
    setMaps((prev) => prev.filter((m) => m.id !== map.id));
    if (primaryMapId === map.id) onSetPrimary(null);
    await softDeleteMap(map.id);
  }

  async function handleSetPrimary(map: WorldMap) {
    onSetPrimary(map.id);
    await updateWorld(worldId, { primary_map_id: map.id });
  }

  const handleMapReorder = useCallback(
    (dragged: WorldMap, target: WorldMap, position: 'before' | 'after') => {
      if (dragged.id === target.id) return;
      const ordered = [...maps].sort((a, b) => a.sort_order - b.sort_order);
      const without = ordered.filter((m) => m.id !== dragged.id);
      const targetIdx = without.findIndex((m) => m.id === target.id);
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      without.splice(insertIdx, 0, dragged);
      const reordered = without.map((m, i) => ({ ...m, sort_order: i }));
      setMaps(reordered);
      void reorderMaps(reordered.map((m) => ({ id: m.id, sort_order: m.sort_order })));
    },
    [maps, setMaps],
  );

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={mapSectionStyles.header}>
        <Pressable
          onPress={() => toggle(collapseKey)}
          style={mapSectionStyles.chevronBtn}
          accessibilityLabel={collapsed ? 'Expand maps' : 'Collapse maps'}
        >
          <Icon
            name={collapsed ? 'chevron-right' : 'expand-more'}
            size={14}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldMapIndexHref(worldId))}
          style={mapSectionStyles.headerLabel}
          accessibilityLabel="Maps"
        >
          <Text
            variant="label-md"
            weight="bold"
            uppercase
            style={mapSectionStyles.headerText}
          >
            Maps
          </Text>
        </Pressable>
        <Icon name="map" size={13} color={colors.outline} />
        {isOwner ? (
          <Pressable
            onPress={onAddMap}
            style={mapSectionStyles.addBtn}
            accessibilityLabel="Add map"
          >
            <Icon name="add" size={16} color={colors.outline} />
          </Pressable>
        ) : null}
      </View>
      {!collapsed ? (
        maps.length === 0 ? (
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ paddingLeft: spacing.sm, paddingVertical: 4, color: colors.outline }}
          >
            No maps yet.
          </Text>
        ) : (
          <View>
            {maps.map((m) => (
              <SidebarMapRow
                key={m.id}
                map={m}
                worldId={worldId}
                active={m.id === activeMapId}
                isPrimary={m.id === primaryMapId}
                onContextMenu={(anchor) => setMenuState({ map: m, anchor })}
                onDrop={handleMapReorder}
              />
            ))}
          </View>
        )
      ) : null}

      {menuState ? (
        <MapContextMenu
          anchor={menuState.anchor}
          map={menuState.map}
          isPrimary={menuState.map.id === primaryMapId}
          isOwner={isOwner}
          onClose={() => setMenuState(null)}
          onRename={() => { setRenameMap(menuState.map); setMenuState(null); }}
          onSetPrimary={() => { handleSetPrimary(menuState.map); setMenuState(null); }}
          onDelete={() => { handleDeleteMap(menuState.map); setMenuState(null); }}
        />
      ) : null}

      {renameMap ? (
        <RenameMapModal
          map={renameMap}
          onSave={(label) => { handleRenameMap(renameMap, label); setRenameMap(null); }}
          onClose={() => setRenameMap(null)}
        />
      ) : null}
    </View>
  );
}

function MapContextMenu({ anchor, map, isPrimary, isOwner, onClose, onRename, onSetPrimary, onDelete }: {
  anchor: { x: number; y: number };
  map: WorldMap;
  isPrimary: boolean;
  isOwner: boolean;
  onClose: () => void;
  onRename: () => void;
  onSetPrimary: () => void;
  onDelete: () => void;
}) {
  const items: Array<{ label: string; icon: string; onPress: () => void; disabled?: boolean; destructive?: boolean } | 'divider'> = [
    { label: 'Rename', icon: 'edit', onPress: onRename },
    { label: isPrimary ? 'Primary map' : 'Set as primary map', icon: 'star', onPress: onSetPrimary, disabled: isPrimary },
    'divider',
    { label: 'Delete map', icon: 'delete', onPress: onDelete, destructive: true },
  ];

  const menuHeight = items.length * 34;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const anchorY = Math.min(anchor.y, viewportH - menuHeight - 16);
  const anchorX = Math.min(anchor.x, viewportW - 220);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={mapMenuStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[mapMenuStyles.menuWrapper, { position: 'absolute', left: anchorX, top: anchorY }]}>
          <View style={mapMenuStyles.menu}>
            {items.map((item, i) => {
              if (item === 'divider') return <View key={`div-${i}`} style={mapMenuStyles.divider} />;
              return (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  style={({ pressed }) => [
                    mapMenuStyles.menuRow,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
                    item.disabled && { opacity: 0.4 },
                  ]}
                >
                  <Icon name={item.icon as React.ComponentProps<typeof Icon>['name']} size={16} color={item.destructive ? colors.hpDanger : colors.onSurfaceVariant} />
                  <Text variant="label-md" style={{ flex: 1, color: item.destructive ? colors.hpDanger : colors.onSurface }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RenameMapModal({ map, onSave, onClose }: { map: WorldMap; onSave: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState(map.label);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={mapMenuStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
          <Card tier="container" padding="lg" style={{ width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <MetaLabel size="sm" tone="accent">Rename map</MetaLabel>
                <Text variant="headline-sm" family="serif-display" weight="bold" style={{ marginTop: 4 }}>{map.label}</Text>
              </View>
              <Pressable onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full }}>
                <Icon name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              <Input label="New name" value={label} onChangeText={setLabel} autoFocus onSubmitEditing={() => onSave(label)} />
              <GradientButton label="Rename" onPress={() => onSave(label)} disabled={!label.trim()} />
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mapSectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 2,
    paddingRight: spacing.xs,
    height: 32,
    gap: 2,
  },
  chevronBtn: {
    width: 14,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1.2,
    fontSize: 11,
  },
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 28,
    paddingRight: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  mapRowActive: {
    backgroundColor: colors.primaryContainer + '33',
  },
  dropLine: {
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
});

const mapMenuStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuWrapper: {
    width: 200,
  },
  menu: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.xs,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outlineVariant + '33',
    marginVertical: 2,
  },
});

const styles = StyleSheet.create({
  root: {
    width: 260,
    backgroundColor: colors.surfaceContainerLow,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  topBarBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  topBarLogo: {
    width: 26,
    height: 26,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    paddingTop: spacing.xl,
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  tree: {
    flex: 1,
  },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trashLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  // Collapsed rail mode
  collapsedRoot: {
    width: 52,
    backgroundColor: colors.surfaceContainerLowest,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '22',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  collapsedItem: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedLogo: {
    width: 28,
    height: 28,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
