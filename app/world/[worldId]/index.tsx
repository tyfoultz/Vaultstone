import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getCampaignsForWorld, updateWorld, uploadWorldCover } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
  useWorldsStore,
} from '@vaultstone/store';
import { Chip, GhostButton, GradientButton, Icon, ImageCropModal, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { Database, WorldSection } from '@vaultstone/types';

import { useActiveSection } from '../../../components/world/ActiveSectionContext';
import { CreatePageModal } from '../../../components/world/CreatePageModal';
import { CreateSectionModal } from '../../../components/world/CreateSectionModal';
import {
  WorldSectionAddCard,
  WorldSectionCard,
} from '../../../components/world/WorldSectionCard';
import { WorldTopBar } from '../../../components/world/WorldTopBar';
import { worldSectionHref } from '../../../components/world/worldHref';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

// CSS grid lives inline; see note in SectionPageGrid.tsx.
const ATLAS_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: spacing.md,
} as const;

export default function WorldLandingScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const world = useCurrentWorldStore((s) => s.world);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const storeUpdateWorld = useWorldsStore((s) => s.updateWorld);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const { setActiveSectionId } = useActiveSection();
  const [linkedCampaigns, setLinkedCampaigns] = useState<Campaign[]>([]);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageSectionId, setCreatePageSectionId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);

  const isOwner = !!(user && world && user.id === world.owner_user_id);

  async function uploadCover(uri: string, mime: string) {
    if (!world) return;
    setUploading(true);
    const { url } = await uploadWorldCover(world.id, uri, mime);
    setUploading(false);
    if (url) {
      storeUpdateWorld(world.id, { cover_image_url: url });
      setActiveWorld({ ...world, cover_image_url: url });
    }
  }

  async function handlePickCover() {
    if (!world) return;
    const isWeb = Platform.OS === 'web';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !isWeb,
      aspect: [21, 7],
      quality: 0.5,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (isWeb) {
      setCropUri(asset.uri);
    } else {
      await uploadCover(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }

  async function handleCropConfirm(croppedUri: string) {
    setCropUri(null);
    await uploadCover(croppedUri, 'image/jpeg');
  }

  async function handleCopyFromSidebar() {
    if (!world?.thumbnail_url) return;
    setUploading(true);
    const { error } = await updateWorld(world.id, { cover_image_url: world.thumbnail_url });
    setUploading(false);
    if (!error) {
      storeUpdateWorld(world.id, { cover_image_url: world.thumbnail_url });
      setActiveWorld({ ...world, cover_image_url: world.thumbnail_url });
    }
  }

  useEffect(() => {
    if (!worldId) return;
    getCampaignsForWorld(worldId).then(({ data }) => {
      const rows = (data ?? []) as unknown as Array<{ campaigns: Campaign | null }>;
      setLinkedCampaigns(rows.map((r) => r.campaigns).filter((c): c is Campaign => !!c));
    });
  }, [worldId]);

  const { pageCounts, totalPages } = useMemo(() => {
    const counts: Record<string, number> = {};
    const pages = pagesByWorld ?? [];
    for (const p of pages) {
      counts[p.section_id] = (counts[p.section_id] ?? 0) + 1;
    }
    return { pageCounts: counts, totalPages: pages.length };
  }, [pagesByWorld]);

  if (!world || !worldId) return null;

  const handleSectionPress = (section: WorldSection) => {
    setActiveSectionId(section.id);
    router.push(worldSectionHref(worldId, section.id));
  };

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'chronicle', label: 'Chronicle' },
          { key: 'world', label: world.name },
        ]}
        actions={
          <>
            <GhostButton label="New page" onPress={() => setCreatePageSectionId(sections[0]?.id ?? null)} />
            <GradientButton label="New section" onPress={() => setCreateSectionOpen(true)} />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Hero banner */}
        <View style={styles.heroBanner}>
          {world.cover_image_url ? (
            <Image source={{ uri: world.cover_image_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.primaryContainer + '44', colors.surfaceContainerLowest]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroPlaceholder}
            />
          )}
          <LinearGradient
            colors={['transparent', colors.surfaceCanvas]}
            locations={[0.3, 1]}
            style={styles.heroScrim}
          />

          {/* Top toolbar */}
          <View style={styles.heroToolbar}>
            {!world.cover_image_url ? (
              <View style={styles.placeholderBadge}>
                <Icon name="auto-fix-high" size={14} color={colors.onSurfaceVariant} />
                <Text
                  variant="label-sm"
                  weight="semibold"
                  uppercase
                  style={{ color: colors.onSurfaceVariant, letterSpacing: 1.2 }}
                >
                  Placeholder cover
                </Text>
              </View>
            ) : (
              <View />
            )}
            {isOwner ? (
              <View style={styles.heroActions}>
                {!world.cover_image_url && world.thumbnail_url ? (
                  <GhostButton
                    label="Use sidebar image"
                    icon="content-copy"
                    onPress={handleCopyFromSidebar}
                    style={styles.heroBtnCompact}
                  />
                ) : null}
                <GhostButton
                  label="Change cover"
                  icon="edit"
                  onPress={handlePickCover}
                  loading={uploading}
                  style={styles.heroBtnCompact}
                />
              </View>
            ) : null}
          </View>

          {/* Bottom overlay */}
          <View style={styles.heroOverlay}>
            <Text
              variant="label-sm"
              weight="semibold"
              uppercase
              style={styles.heroMeta}
            >
              {[
                'Chronicle',
                `${sections.length} section${sections.length !== 1 ? 's' : ''}`,
                `${totalPages} page${totalPages !== 1 ? 's' : ''}`,
                ...(linkedCampaigns.length > 0
                  ? [`${linkedCampaigns.length} campaign${linkedCampaigns.length !== 1 ? 's' : ''}`]
                  : []),
              ].join('  ·  ')}
            </Text>
            <Text
              variant="display-lg"
              family="serif-display"
              weight="bold"
              style={styles.heroTitle}
              numberOfLines={2}
            >
              {world.name}
            </Text>
            {world.description ? (
              <Text
                variant="body-lg"
                family="serif-body"
                tone="secondary"
                style={styles.heroDescription}
                numberOfLines={3}
              >
                {world.description}
              </Text>
            ) : null}
          </View>
        </View>

        {cropUri ? (
          <ImageCropModal
            visible
            imageUri={cropUri}
            aspect={[21, 7]}
            onConfirm={handleCropConfirm}
            onCancel={() => setCropUri(null)}
          />
        ) : null}

        {linkedCampaigns.length > 0 ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <MetaLabel size="sm" tone="muted">
              Linked campaigns
            </MetaLabel>
            <View style={styles.chipRow}>
              {linkedCampaigns.map((c) => (
                <Chip key={c.id} label={c.name} variant="category" />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl + spacing.sm, gap: spacing.md }}>
          <MetaLabel size="sm" tone="accent">
            The Atlas
          </MetaLabel>
          <Text
            variant="headline-sm"
            family="serif-display"
            weight="bold"
            style={{ color: colors.onSurface }}
          >
            Sections in this world
          </Text>
          <View style={ATLAS_GRID_STYLE as object}>
            {sections.map((section) => {
              const template = getTemplate(section.template_key);
              return (
                <WorldSectionCard
                  key={section.id}
                  section={section}
                  template={template}
                  pageCount={pageCounts[section.id] ?? 0}
                  onPress={() => handleSectionPress(section)}
                />
              );
            })}
            <WorldSectionAddCard onPress={() => setCreateSectionOpen(true)} />
          </View>
        </View>
      </ScrollView>

      {createSectionOpen ? (
        <CreateSectionModal worldId={worldId} onClose={() => setCreateSectionOpen(false)} />
      ) : null}

      {createPageSectionId ? (
        <CreatePageModal
          worldId={worldId}
          sectionId={createPageSectionId}
          onClose={() => setCreatePageSectionId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  container: {
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: spacing['2xl'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  heroBanner: {
    width: '100%',
    aspectRatio: 21 / 7,
    minHeight: 200,
    maxHeight: 360,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    zIndex: 2,
  },
  placeholderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    backgroundColor: colors.surfaceContainerHigh + '99',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBtnCompact: {
    height: 36,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceContainerHigh + '99',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroMeta: {
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: colors.onSurface,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1,
  },
  heroDescription: {
    color: colors.onSurfaceVariant,
    maxWidth: 600,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
});
