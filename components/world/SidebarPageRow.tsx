import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePagesStore, useSidebarCollapseStore } from '@vaultstone/store';
import { movePage } from '@vaultstone/api';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { WorldPage, WorldPageTreeNode } from '@vaultstone/types';

import { MoveToSectionModal } from './MoveToSectionModal';
import { PageContextMenu } from './PageContextMenu';
import { RenamePageModal } from './RenamePageModal';
import { computeDropMove, isDescendant } from './sidebarTreeOps';
import { usePageDnd } from './usePageDnd';
import { worldPageHref } from './worldHref';

type Props = {
  node: WorldPageTreeNode;
  worldId: string;
  activePageId?: string | null;
  forcedOpenIds: Set<string>;
  onAddSubPage?: (sectionId: string, parentPageId: string) => void;
};

const MATERIAL_ICON: Record<string, string> = {
  custom: 'article',
  location: 'place',
  npc: 'person',
  faction: 'shield',
  religion: 'auto-awesome',
  organization: 'groups',
  item: 'diamond',
  lore: 'auto-stories',
  timeline: 'timeline',
  pc_stub: 'person-outline',
  player_character: 'person',
};

const CHEVRON_WIDTH = 16;
const SIDEBAR_DEPTH_CAP = 6;

export function SidebarPageRow({ node, worldId, activePageId, forcedOpenIds, onAddSubPage }: Props) {
  const router = useRouter();
  const icon = MATERIAL_ICON[node.page.page_kind] ?? 'article';
  const active = activePageId === node.page.id;
  const indent = node.depth * 12;
  const hasChildren = node.children.length > 0;
  const [hovered, setHovered] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveToSectionOpen, setMoveToSectionOpen] = useState(false);

  const collapseKey = `${worldId}:${node.page.id}`;
  const isPersistedCollapsed = useSidebarCollapseStore((s) => !!s.collapsed[collapseKey]);
  const toggle = useSidebarCollapseStore((s) => s.toggle);
  const effectiveCollapsed = hasChildren && isPersistedCollapsed && !forcedOpenIds.has(node.page.id);

  const allPages = usePagesStore((s) => s.byWorldId[worldId]) ?? [];
  const storeUpdate = usePagesStore((s) => s.updatePage);

  const handleDrop = useCallback(
    (draggedPage: WorldPage, targetPage: WorldPage, position: 'before' | 'child' | 'after') => {
      const pages = usePagesStore.getState().byWorldId[worldId] ?? [];
      const move = computeDropMove(draggedPage, targetPage, position, pages);
      if (!move) return;

      storeUpdate(move.pageId, {
        section_id: move.newSectionId,
        parent_page_id: move.newParentId,
        sort_order: move.newSortOrder,
      });

      movePage(move).then(({ error }) => {
        if (error) {
          storeUpdate(draggedPage.id, {
            section_id: draggedPage.section_id,
            parent_page_id: draggedPage.parent_page_id,
            sort_order: draggedPage.sort_order,
          });
        }
      });
    },
    [worldId, storeUpdate],
  );

  const getIsDescendant = useCallback(
    (draggedId: string, targetId: string) => {
      return isDescendant(targetId, draggedId, allPages);
    },
    [allPages],
  );

  const { ref: dndRef, isDragging, dropPosition, isOver } = usePageDnd(
    node.page,
    node.depth,
    SIDEBAR_DEPTH_CAP - 1,
    handleDrop,
    getIsDescendant,
  );

  const handleContextMenu = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number }; preventDefault?: () => void }) => {
      if (e.preventDefault) e.preventDefault();
      setMenuAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    },
    [],
  );

  const rowContent = (
    <Pressable
      onPress={() => router.push(worldPageHref(worldId, node.page.id))}
      onLongPress={Platform.OS !== 'web' ? () => setMenuAnchor({ x: 0, y: 0 }) : undefined}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      style={({ pressed }) => [
        styles.row,
        { paddingLeft: spacing.xs + indent },
        (pressed || active) && { backgroundColor: colors.surfaceContainerHigh },
        isDragging && { opacity: 0.4 },
        isOver && dropPosition === 'child' && styles.dropChild,
      ]}
    >
      {hasChildren ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            toggle(collapseKey);
          }}
          style={styles.chevronBtn}
          accessibilityLabel={effectiveCollapsed ? 'Expand' : 'Collapse'}
        >
          <Icon
            name={effectiveCollapsed ? 'chevron-right' : 'expand-more'}
            size={14}
            color={colors.outline}
          />
        </Pressable>
      ) : (
        <View style={styles.chevronSpacer} />
      )}
      <Icon
        name={icon as React.ComponentProps<typeof Icon>['name']}
        size={14}
        color={active ? colors.primary : colors.onSurfaceVariant}
      />
      <Text
        variant="body-sm"
        numberOfLines={1}
        style={{
          flex: 1,
          color: active ? colors.onSurface : colors.onSurfaceVariant,
        }}
      >
        {node.page.title}
      </Text>
      {hovered && onAddSubPage ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onAddSubPage(node.page.section_id, node.page.id);
          }}
          style={styles.addBtn}
          accessibilityLabel="Add sub-page"
        >
          <Icon name="add" size={14} color={colors.outline} />
        </Pressable>
      ) : null}
    </Pressable>
  );

  const dropIndicator = isOver && dropPosition && dropPosition !== 'child' ? (
    <View
      style={[
        styles.dropLine,
        dropPosition === 'before' ? styles.dropLineBefore : styles.dropLineAfter,
        { marginLeft: spacing.xs + indent },
      ]}
    />
  ) : null;

  return (
    <View>
      {Platform.OS === 'web' ? (
        <View
          ref={dndRef as React.RefObject<View>}
          // @ts-expect-error -- RN Web supports onContextMenu on View
          onContextMenu={handleContextMenu}
          style={{ position: 'relative' }}
        >
          {dropPosition === 'before' && dropIndicator}
          {rowContent}
          {dropPosition === 'after' && dropIndicator}
        </View>
      ) : (
        rowContent
      )}

      {menuAnchor ? (
        <PageContextMenu
          visible
          anchor={menuAnchor}
          page={node.page}
          worldId={worldId}
          node={node}
          onClose={() => setMenuAnchor(null)}
          onAddSubPage={() =>
            onAddSubPage?.(node.page.section_id, node.page.id)
          }
          onRename={() => setRenameOpen(true)}
          onMoveToSection={() => setMoveToSectionOpen(true)}
        />
      ) : null}

      {renameOpen ? (
        <RenamePageModal
          page={node.page}
          onClose={() => setRenameOpen(false)}
        />
      ) : null}

      {moveToSectionOpen ? (
        <MoveToSectionModal
          page={node.page}
          worldId={worldId}
          onClose={() => setMoveToSectionOpen(false)}
        />
      ) : null}

      {!effectiveCollapsed &&
        node.children.map((child) => (
          <SidebarPageRow
            key={child.page.id}
            node={child}
            worldId={worldId}
            activePageId={activePageId}
            forcedOpenIds={forcedOpenIds}
            onAddSubPage={onAddSubPage}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
  chevronBtn: {
    width: CHEVRON_WIDTH,
    height: CHEVRON_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronSpacer: {
    width: CHEVRON_WIDTH,
  },
  addBtn: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropChild: {
    backgroundColor: colors.primaryContainer + '33',
    borderRadius: radius.lg,
  },
  dropLine: {
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  dropLineBefore: {
    marginBottom: -1,
  },
  dropLineAfter: {
    marginTop: -1,
  },
});
