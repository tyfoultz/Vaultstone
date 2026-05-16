import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { getTemplate } from '@vaultstone/content';
import type { Database, TimelineCalendarSchema, WorldSection } from '@vaultstone/types';
import { Chip, GhostButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { CreateSectionModal } from './CreateSectionModal';
import { WorldTopBar } from './WorldTopBar';
import { ACCENT_SWATCH, toMaterialIcon } from './helpers';
import { worldPagesHref } from './worldHref';

// Mirrors the type from WorldHome.tsx; inlined here to avoid a
// circular import (WorldHome imports MobileWorldHome). The two should
// stay in sync.
type WorldHomeNavigateTarget =
  | { kind: 'page'; pageId: string }
  | { kind: 'section'; sectionId: string }
  | { kind: 'campaign'; campaignId: string };

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  worldId: string;
  world: World;
  sections: WorldSection[];
  pageCounts: Record<string, number>;
  pagesByWorld?: { id: string; section_id: string }[];
  isOwner: boolean;
  calendarSchema: TimelineCalendarSchema | null;
  onSearchPress?: () => void;
  /** See `WorldHomeNavigateTarget` on WorldHome.tsx. */
  onNavigate?: (target: WorldHomeNavigateTarget) => boolean;
};

export function MobileWorldHome({
  worldId,
  world,
  sections,
  pageCounts,
  pagesByWorld,
  isOwner,
  calendarSchema,
  onSearchPress,
  onNavigate,
}: Props) {
  const router = useRouter();
  const [createSectionOpen, setCreateSectionOpen] = useState(false);

  const dateValues = world.current_date_values as Record<string, string> | null;
  const currentEra = useMemo(() => {
    if (!dateValues?.era || !calendarSchema) return null;
    return calendarSchema.eras.find((e) => e.key === dateValues.era) ?? null;
  }, [dateValues?.era, calendarSchema]);

  const formattedDate = useMemo(() => {
    if (!dateValues || !currentEra) return null;
    const parts: string[] = [];
    for (const level of currentEra.dateLevels) {
      const val = dateValues[level.key];
      if (val != null && val !== '') parts.push(`${val} ${level.label}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [dateValues, currentEra]);

  function handleSectionPress(section: WorldSection) {
    // Same embed protocol as desktop: prefer drilling into the
    // section's first page when the host accepts it.
    if (onNavigate) {
      const firstPage = (pagesByWorld ?? []).find((p) => p.section_id === section.id);
      if (firstPage && onNavigate({ kind: 'page', pageId: firstPage.id })) return;
      if (onNavigate({ kind: 'section', sectionId: section.id })) return;
    }
    router.push((worldPagesHref(worldId) + '?section=' + section.id) as never);
  }

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world.name.toUpperCase() },
          { key: 'home', label: 'World' },
        ]}
        title={world.name}
        onSearchPress={onSearchPress}
        actions={
          isOwner ? (
            <GhostButton label="+ New Section" onPress={() => setCreateSectionOpen(true)} />
          ) : null
        }
      />

      <FlatList
        data={sections}
        keyExtractor={(s) => s.id}
        numColumns={2}
        columnWrapperStyle={styles.catalogRow}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            {/* Hero */}
            <View style={styles.hero}>
              {world.cover_image_url ? (
                <Image source={{ uri: world.cover_image_url }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={[colors.primaryContainer + '44', colors.surfaceContainerLowest]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroImage}
                />
              )}
              <LinearGradient
                colors={['transparent', colors.surfaceCanvas]}
                locations={[0.3, 1]}
                style={styles.heroImage}
              />
              <View style={styles.heroOverlay}>
                <View style={styles.metaRow}>
                  {currentEra ? (
                    <View style={styles.eraChip}>
                      <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.primary }}>
                        {currentEra.label}
                      </Text>
                    </View>
                  ) : null}
                  {formattedDate ? (
                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                      {formattedDate}
                    </Text>
                  ) : null}
                </View>
                <Text
                  variant="display-md"
                  family="serif-display"
                  weight="bold"
                  style={styles.heroTitle}
                  numberOfLines={2}
                >
                  {world.description || world.name}
                </Text>
              </View>
            </View>

            {/* Gazetteer */}
            {world.description ? (
              <View style={styles.gazetteer}>
                <MetaLabel size="sm" tone="accent" style={{ marginBottom: spacing.xs }}>
                  WORLD GAZETTEER
                </MetaLabel>
                <Text
                  variant="body-md"
                  family="serif-body"
                  style={styles.gazetteerText}
                  numberOfLines={6}
                >
                  {world.description}
                </Text>
              </View>
            ) : null}

            {/* Catalog header */}
            <View style={styles.catalogHeader}>
              <Text variant="headline-sm" family="serif-display" weight="bold" style={{ color: colors.onSurface }}>
                Catalog
              </Text>
              {isOwner ? (
                <GhostButton label="+ NEW" onPress={() => setCreateSectionOpen(true)} />
              ) : null}
            </View>
          </>
        }
        renderItem={({ item: section }) => {
          const template = getTemplate(section.template_key);
          const swatch = ACCENT_SWATCH[template.accentToken];
          const iconName = toMaterialIcon(section.custom_icon ?? template.icon);
          const isHidden = section.force_hidden_from_players;
          const count = pageCounts[section.id] ?? 0;

          return (
            <Pressable style={styles.sectionCard} onPress={() => handleSectionPress(section)}>
              <LinearGradient
                colors={[swatch.container, swatch.glow]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.sectionIcon, { borderColor: swatch.border }]}
              >
                <Icon
                  name={iconName as React.ComponentProps<typeof Icon>['name']}
                  size={20}
                  color={swatch.fg}
                />
              </LinearGradient>
              <Text variant="title-sm" family="serif-display" weight="bold" style={{ color: colors.onSurface, marginTop: spacing.sm }}>
                {section.name}
              </Text>
              <View style={[styles.visBadge, isHidden ? styles.badgeGm : styles.badgeShared]}>
                <View style={[styles.visDot, { backgroundColor: isHidden ? colors.hpWarning : colors.hpHealthy }]} />
                <Text variant="label-sm" style={{ color: isHidden ? colors.hpWarning : colors.hpHealthy, fontSize: 10 }}>
                  {isHidden ? 'GM ONLY' : 'SHARED'}
                </Text>
              </View>
              <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, marginTop: spacing.xs }}>
                {count} {count === 1 ? 'entry' : 'entries'}
              </Text>
            </Pressable>
          );
        }}
      />

      {createSectionOpen ? (
        <CreateSectionModal worldId={worldId} onClose={() => setCreateSectionOpen(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.md,
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
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  eraChip: {
    backgroundColor: colors.primaryContainer + '44',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  heroTitle: {
    color: colors.onSurface,
    fontSize: 28,
    lineHeight: 34,
  },
  gazetteer: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceContainer + '88',
    borderRadius: 4,
    paddingRight: spacing.md,
  },
  gazetteerText: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  catalogRow: {
    gap: spacing.sm,
  },
  sectionCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  visDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeShared: {},
  badgeGm: {},
});
