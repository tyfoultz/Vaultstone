import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { WorldPage, WorldSection } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, spacing, useBreakpoint } from '@vaultstone/ui';

import { WorldTopBar } from '../../../components/world/WorldTopBar';
import { ACCENT_SWATCH, toMaterialIcon } from '../../../components/world/helpers';
import { worldHref, worldPageHref } from '../../../components/world/worldHref';

type SectionGroup = {
  section: WorldSection;
  data: WorldPage[];
};

export default function PagesListScreen() {
  const { worldId, section: filterSectionId } = useLocalSearchParams<{
    worldId: string;
    section?: string;
  }>();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!isMobile) {
    router.replace(worldHref(worldId));
    return null;
  }

  const sectionGroups = useMemo(() => {
    const pages = pagesByWorld ?? [];
    const query = search.toLowerCase().trim();
    const groups: SectionGroup[] = [];

    for (const section of sections) {
      let sectionPages = pages.filter((p) => p.section_id === section.id);
      if (query) {
        sectionPages = sectionPages.filter((p) =>
          p.title.toLowerCase().includes(query),
        );
      }
      sectionPages.sort((a, b) => a.title.localeCompare(b.title));
      if (sectionPages.length > 0 || !query) {
        groups.push({ section, data: sectionPages });
      }
    }
    return groups;
  }, [sections, pagesByWorld, search]);

  const totalPages = useMemo(
    () => (pagesByWorld ?? []).length,
    [pagesByWorld],
  );

  const toggleCollapse = useCallback((sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const filteredGroups = useMemo(() => {
    return sectionGroups.map((g) => ({
      ...g,
      data: collapsed.has(g.section.id) ? [] : g.data,
    }));
  }, [sectionGroups, collapsed]);

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world?.name ?? '' },
          { key: 'pages', label: 'All pages' },
        ]}
        title="All pages"
      />

      <View style={styles.searchContainer}>
        <Icon name="search" size={18} color={colors.onSurfaceVariant} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${totalPages} pages...`}
          placeholderTextColor={colors.outlineVariant}
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Icon name="close" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>

      <SectionList
        sections={filteredGroups}
        keyExtractor={(page) => page.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section: { section, data } }) => {
          const template = getTemplate(section.template_key);
          const swatch = ACCENT_SWATCH[template.accentToken];
          const isCollapsed = collapsed.has(section.id);
          const realCount =
            sectionGroups.find((g) => g.section.id === section.id)?.data
              .length ?? 0;

          return (
            <Pressable
              style={styles.sectionHeader}
              onPress={() => toggleCollapse(section.id)}
            >
              <Icon
                name={isCollapsed ? 'chevron-right' : 'expand-more'}
                size={20}
                color={colors.onSurfaceVariant}
              />
              <MetaLabel size="sm" tone="muted" style={{ flex: 1 }}>
                {section.name.toUpperCase()}
              </MetaLabel>
              <MetaLabel size="sm" tone="muted">
                {realCount}
              </MetaLabel>
            </Pressable>
          );
        }}
        renderItem={({ item: page }) => {
          const section = sections.find((s) => s.id === page.section_id);
          const template = section
            ? getTemplate(section.template_key)
            : null;
          const swatch = template
            ? ACCENT_SWATCH[template.accentToken]
            : null;
          const iconName = section
            ? toMaterialIcon(section.custom_icon ?? template!.icon)
            : 'article';
          const isGmOnly = !page.visible_to_players;

          return (
            <Pressable
              style={styles.pageRow}
              onPress={() => router.push(worldPageHref(worldId, page.id))}
            >
              <Icon
                name={iconName as React.ComponentProps<typeof Icon>['name']}
                size={18}
                color={swatch?.fg ?? colors.onSurfaceVariant}
              />
              <Text
                variant="body-md"
                style={{ flex: 1, color: colors.onSurface }}
                numberOfLines={1}
              >
                {page.title}
              </Text>
              {isGmOnly ? (
                <View style={styles.gmBadge}>
                  <Text variant="label-sm" style={{ color: colors.hpWarning, fontSize: 10 }}>
                    GM
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        renderSectionFooter={({ section: { data, section } }) => {
          if (data.length === 0 && !collapsed.has(section.id)) {
            return (
              <View style={styles.emptySection}>
                <Text variant="body-sm" style={{ color: colors.outlineVariant }}>
                  No pages
                </Text>
              </View>
            );
          }
          return null;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 0,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingLeft: spacing.lg + spacing.sm,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    minHeight: 44,
  },
  gmBadge: {
    backgroundColor: colors.hpWarning + '22',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptySection: {
    paddingHorizontal: spacing.lg + spacing.sm,
    paddingVertical: spacing.sm,
  },
});
