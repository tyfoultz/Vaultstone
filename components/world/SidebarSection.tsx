import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  buildPageTree,
  useCurrentWorldStore,
  usePagesStore,
  useSidebarCollapseStore,
} from '@vaultstone/store';
import type { WorldPage, WorldSection } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { isPageVisibleToPlayersPreview } from './playerViewFilters';
import { SidebarPageRow } from './SidebarPageRow';
import { worldSectionHref } from './worldHref';

type Props = {
  section: WorldSection;
  worldId: string;
  activePageId?: string | null;
  onAddPage?: () => void;
  onAddSubPage?: (sectionId: string, parentPageId: string) => void;
};

const EMPTY_SET = new Set<string>();

export function SidebarSection({ section, worldId, activePageId, onAddPage, onAddSubPage }: Props) {
  const collapseKey = `${worldId}:${section.id}`;
  const collapsed = useSidebarCollapseStore((s) => !!s.collapsed[collapseKey]);
  const toggle = useSidebarCollapseStore((s) => s.toggle);

  const rawPages = usePagesStore((s) => s.byWorldId[worldId]);
  const playerView = useCurrentWorldStore((s) => s.playerViewPreview);
  const tree = useMemo(() => {
    const filtered = playerView
      ? (rawPages ?? []).filter((p: WorldPage) =>
          isPageVisibleToPlayersPreview(p, section),
        )
      : rawPages;
    return buildPageTree(filtered, section.id);
  }, [rawPages, section, playerView]);

  const forcedOpenIds = useMemo(() => {
    if (!activePageId) return EMPTY_SET;
    const pages = rawPages ?? [];
    const pageMap = new Map(pages.map((p) => [p.id, p]));
    if (!pageMap.has(activePageId)) return EMPTY_SET;
    const ids = new Set<string>();
    let current = pageMap.get(activePageId);
    while (current?.parent_page_id) {
      ids.add(current.parent_page_id);
      current = pageMap.get(current.parent_page_id);
    }
    return ids.size > 0 ? ids : EMPTY_SET;
  }, [activePageId, rawPages]);

  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => toggle(collapseKey)}
          style={styles.chevronBtn}
          accessibilityLabel={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <Icon
            name={collapsed ? 'chevron-right' : 'expand-more'}
            size={16}
            color={colors.outline}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldSectionHref(worldId, section.id))}
          style={styles.headerLabel}
          accessibilityLabel={`Open ${section.name}`}
        >
          <MetaLabel size="sm" tone="muted">
            {section.name}
          </MetaLabel>
        </Pressable>
        {onAddPage ? (
          <Pressable
            onPress={onAddPage}
            style={styles.addBtn}
            accessibilityLabel="Add page"
          >
            <Icon name="add" size={16} color={colors.outline} />
          </Pressable>
        ) : null}
      </View>

      {!collapsed ? (
        tree.length === 0 ? (
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ paddingLeft: spacing.sm, paddingVertical: 4, color: colors.outline }}
          >
            No pages yet.
          </Text>
        ) : (
          <View>
            {tree.map((node) => (
              <SidebarPageRow
                key={node.page.id}
                node={node}
                worldId={worldId}
                activePageId={activePageId}
                forcedOpenIds={forcedOpenIds}
                onAddSubPage={onAddSubPage}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
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
  },
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
