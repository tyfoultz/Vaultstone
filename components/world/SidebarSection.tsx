import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  buildPageTree,
  useCurrentWorldStore,
  usePagesStore,
  useSidebarCollapseStore,
} from '@vaultstone/store';
import { getTemplate } from '@vaultstone/content';
import type { TemplateKey, WorldPage, WorldSection } from '@vaultstone/types';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { toMaterialIcon } from './helpers';

import { isPageVisibleToPlayersPreview } from './playerViewFilters';
import { SectionContextMenu } from './SectionContextMenu';
import { SectionSettingsModal } from './SectionSettingsModal';
import { SidebarPageRow } from './SidebarPageRow';
import { useSectionDnd } from './useSectionDnd';
import { worldSectionHref } from './worldHref';

type Props = {
  section: WorldSection;
  worldId: string;
  activePageId?: string | null;
  onAddPage?: () => void;
  onAddSubPage?: (sectionId: string, parentPageId: string) => void;
  onReorder?: (dragged: WorldSection, target: WorldSection, position: 'before' | 'after') => void;
  onPinToPrep?: (pageId: string) => void;
};

const EMPTY_SET = new Set<string>();

export function SidebarSection({ section, worldId, activePageId, onAddPage, onAddSubPage, onReorder, onPinToPrep }: Props) {
  const collapseKey = `${worldId}:${section.id}`;
  const collapsed = useSidebarCollapseStore((s) => !!s.collapsed[collapseKey]);
  const toggle = useSidebarCollapseStore((s) => s.toggle);

  const handleSectionDrop = useCallback(
    (dragged: WorldSection, target: WorldSection, position: 'before' | 'after') => {
      onReorder?.(dragged, target, position);
    },
    [onReorder],
  );

  const { ref: sectionDndRef, isDragging, dropPosition: sectionDropPos, isOver: sectionIsOver } = useSectionDnd(
    section,
    handleSectionDrop,
  );

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
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleContextMenu = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number }; preventDefault?: () => void }) => {
      if (e.preventDefault) e.preventDefault();
      setMenuAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    },
    [],
  );

  const sectionIcon = (() => {
    let iconName = 'article';
    try { iconName = toMaterialIcon(getTemplate(section.template_key as TemplateKey).icon); } catch { /* default */ }
    return iconName;
  })();

  const headerContent = (
    <View style={styles.header}>
      <Pressable
        onPress={() => toggle(collapseKey)}
        style={styles.chevronBtn}
        accessibilityLabel={collapsed ? 'Expand section' : 'Collapse section'}
      >
        <Icon
          name={collapsed ? 'chevron-right' : 'expand-more'}
          size={14}
          color={colors.onSurfaceVariant}
        />
      </Pressable>
      <Pressable
        onPress={() => router.push(worldSectionHref(worldId, section.id))}
        onLongPress={Platform.OS !== 'web' ? () => setMenuAnchor({ x: 0, y: 0 }) : undefined}
        style={styles.headerLabel}
        accessibilityLabel={`Open ${section.name}`}
      >
        <Text
          variant="label-md"
          weight="bold"
          uppercase
          style={styles.headerText}
        >
          {section.name}
        </Text>
      </Pressable>
      <Icon name={sectionIcon as React.ComponentProps<typeof Icon>['name']} size={13} color={colors.outline} />
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
  );

  const sectionDropLine = sectionIsOver && sectionDropPos ? (
    <View
      style={[
        styles.sectionDropLine,
        sectionDropPos === 'before' ? { marginBottom: -1 } : { marginTop: -1 },
      ]}
    />
  ) : null;

  return (
    <View style={[styles.root, isDragging && { opacity: 0.4 }]}>
      {Platform.OS === 'web' ? (
        <View
          ref={sectionDndRef as React.RefObject<View>}
          // @ts-expect-error -- RN Web supports onContextMenu on View
          onContextMenu={handleContextMenu}
          style={{ position: 'relative' }}
        >
          {sectionDropPos === 'before' && sectionDropLine}
          {headerContent}
          {sectionDropPos === 'after' && sectionDropLine}
        </View>
      ) : (
        headerContent
      )}

      {menuAnchor ? (
        <SectionContextMenu
          visible
          anchor={menuAnchor}
          section={section}
          onClose={() => setMenuAnchor(null)}
          onAddPage={() => onAddPage?.()}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      {settingsOpen ? (
        <SectionSettingsModal
          section={section}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

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
                onPinToPrep={onPinToPrep}
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
    paddingLeft: 2,
    paddingRight: spacing.xs,
    height: 32,
    gap: 2,
  },
  headerText: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1.2,
    fontSize: 11,
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
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionDropLine: {
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
});
