import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { uploadWorldThumbnail } from '@vaultstone/api';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  useSectionsStore,
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

import { useActiveSection } from './ActiveSectionContext';
import { CreatePageModal } from './CreatePageModal';
import { CreateSectionModal } from './CreateSectionModal';
import { LensDropdown } from './LensDropdown';
import { isSectionVisibleToPlayersPreview } from './playerViewFilters';
import { SidebarSection } from './SidebarSection';
import { WorldSearchDrawer } from './WorldSearchDrawer';
import { WorldSettingsModal } from './WorldSettingsModal';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  world: World;
  activePageId?: string | null;
};

// Rewritten Phase 2 sidebar. Header block (cover + name + gear) + campaign
// switch + search shell. Main column swaps to the active section's tree;
// when no section is active on the rail, the sidebar lists every section
// as a compact header with its tree inline.
export function WorldSidebar({ world, activePageId }: Props) {
  const { activeSectionId } = useActiveSection();
  const user = useAuthStore((s) => s.user);
  const allSections = useSectionsStore((s) => selectSectionsForWorld(s, world.id));
  const playerView = useCurrentWorldStore((s) => s.playerViewPreview);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const storeUpdateWorld = useWorldsStore((s) => s.updateWorld);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageSectionId, setCreatePageSectionId] = useState<string | null>(null);
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
    const filtered = playerView
      ? allSections.filter(isSectionVisibleToPlayersPreview)
      : allSections;
    if (!activeSectionId) return filtered;
    const match = filtered.find((s) => s.id === activeSectionId);
    return match ? [match] : filtered;
  }, [activeSectionId, allSections, playerView]);

  return (
    <View style={styles.root}>
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
              onAddPage={() => setCreatePageSectionId(section.id)}
            />
          ))
        )}
      </ScrollView>

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
      {createPageSectionId ? (
        <CreatePageModal
          worldId={world.id}
          sectionId={createPageSectionId}
          onClose={() => setCreatePageSectionId(null)}
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
    width: 248,
    backgroundColor: colors.surfaceContainerLow,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
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
});
