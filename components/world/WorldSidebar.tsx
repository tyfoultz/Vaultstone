import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { listMaps, uploadWorldThumbnail, type WorldMap } from '@vaultstone/api';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  useSectionsStore,
  useSidebarCollapseStore,
  useWorldsStore,
} from '@vaultstone/store';
import type { Database } from '@vaultstone/types';
import {
  GhostButton,
  Icon,
  ImageCropModal,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { CreatePageModal } from './CreatePageModal';
import { CreateSectionModal } from './CreateSectionModal';
import { LensDropdown } from './LensDropdown';
import { MapUploadModal } from './map/MapUploadModal';
import { isSectionVisibleToPlayersPreview } from './playerViewFilters';
import { SidebarDndProvider } from './SidebarDndContext';
import { SidebarSection } from './SidebarSection';
import { WorldSearchDrawer } from './WorldSearchDrawer';
import { WorldSettingsModal } from './WorldSettingsModal';
import { worldHref, worldMapHref, worldMapIndexHref, worldPageHref } from './worldHref';

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
  const pathname = usePathname();

  const isOwner = !!(user && user.id === world.owner_user_id);

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
      aspect: [3, 1],
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
          onPress={() => router.push(worldMapIndexHref(world.id))}
          style={styles.topBarBtn}
          accessibilityLabel="Map"
        >
          <Icon name="map" size={18} color={colors.onSurfaceVariant} />
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

      <View style={styles.header}>
        <Pressable
          onPress={isOwner && !world.thumbnail_url ? handlePickThumbnail : undefined}
          disabled={!isOwner || !!world.thumbnail_url || uploading}
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
          {uploading ? (
            <View style={styles.coverUploadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <MetaLabel size="sm" tone="accent">
              Chronicle
            </MetaLabel>
            <Text
              variant="title-md"
              family="serif-display"
              weight="bold"
              numberOfLines={2}
              style={{ marginTop: 2, letterSpacing: -0.25 }}
            >
              {world.name}
            </Text>
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

      <LensDropdown />

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
            />
          ))
        )}
        <SidebarMapSection
          maps={maps}
          worldId={world.id}
          activeMapId={pathname.match(/\/world\/[^/]+\/map\/([^/]+)/)?.[1] ?? null}
          isOwner={isOwner}
          onAddMap={() => setMapUploadOpen(true)}
        />
      </ScrollView>
      </SidebarDndProvider>

      <View style={styles.footer}>
        <GhostButton
          label="+ New section"
          onPress={() => setCreateSectionOpen(true)}
        />
      </View>

      {settingsOpen ? (
        <WorldSettingsModal world={world} onClose={() => setSettingsOpen(false)} />
      ) : null}
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
          aspect={[3, 1]}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropUri(null)}
        />
      ) : null}
    </View>
  );
}

function SidebarMapSection({ maps, worldId, activeMapId, isOwner, onAddMap }: {
  maps: WorldMap[];
  worldId: string;
  activeMapId: string | null;
  isOwner: boolean;
  onAddMap: () => void;
}) {
  const router = useRouter();
  const collapseKey = `${worldId}:__maps`;
  const collapsed = useSidebarCollapseStore((s) => !!s.collapsed[collapseKey]);
  const toggle = useSidebarCollapseStore((s) => s.toggle);

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
            size={16}
            color={colors.outline}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldMapIndexHref(worldId))}
          style={mapSectionStyles.headerLabel}
          accessibilityLabel="Maps"
        >
          <Icon name="map" size={13} color={colors.outline} />
          <MetaLabel size="sm" tone="muted">Maps</MetaLabel>
        </Pressable>
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
            {maps.map((m) => {
              const active = m.id === activeMapId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(worldMapHref(worldId, m.id))}
                  style={[
                    mapSectionStyles.mapRow,
                    active && mapSectionStyles.mapRowActive,
                  ]}
                >
                  <Icon name="map" size={14} color={active ? colors.primary : colors.onSurfaceVariant} />
                  <Text
                    variant="body-sm"
                    numberOfLines={1}
                    style={{ flex: 1, color: active ? colors.primary : colors.onSurface, fontSize: 13 }}
                  >
                    {m.label || 'Untitled map'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}
    </View>
  );
}

const mapSectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    height: 28,
    gap: 2,
  },
  chevronBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  header: {
    gap: spacing.md,
  },
  cover: {
    width: '100%',
    height: 80,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
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
