import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { uploadWorldThumbnail } from '@vaultstone/api';
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
import { isSectionVisibleToPlayersPreview } from './playerViewFilters';
import { SidebarDndProvider } from './SidebarDndContext';
import { SidebarSection } from './SidebarSection';
import { WorldSearchDrawer } from './WorldSearchDrawer';
import { WorldSettingsModal } from './WorldSettingsModal';
import { worldHref, worldMapIndexHref, worldPageHref } from './worldHref';

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

  const isOwner = !!(user && user.id === world.owner_user_id);

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
