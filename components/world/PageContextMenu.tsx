import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { movePage, trashPage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { WorldPage, WorldPageTreeNode } from '@vaultstone/types';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import {
  computeIndent,
  computeMoveDown,
  computeMoveUp,
  computeOutdent,
  getPageDepth,
  type MovePageInput,
} from './sidebarTreeOps';

type Props = {
  visible: boolean;
  anchor: { x: number; y: number } | null;
  page: WorldPage;
  worldId: string;
  node: WorldPageTreeNode;
  onClose: () => void;
  onAddSubPage: () => void;
  onRename: () => void;
  onMoveToSection: () => void;
};

type MenuItem = {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export function PageContextMenu({
  visible,
  anchor,
  page,
  worldId,
  node,
  onClose,
  onAddSubPage,
  onRename,
  onMoveToSection,
}: Props) {
  const allPages = usePagesStore((s) => s.byWorldId[worldId]) ?? [];
  const storeUpdate = usePagesStore((s) => s.updatePage);
  const storeRemove = usePagesStore((s) => s.removePage);

  if (!visible) return null;

  const depth = getPageDepth(page, allPages);
  const indentMove = computeIndent(page, allPages);
  const outdentMove = computeOutdent(page, allPages);
  const moveUpMoves = computeMoveUp(page, allPages);
  const moveDownMoves = computeMoveDown(page, allPages);

  async function execMove(move: MovePageInput) {
    storeUpdate(move.pageId, {
      section_id: move.newSectionId,
      parent_page_id: move.newParentId,
      sort_order: move.newSortOrder,
    });
    const { error } = await movePage(move);
    if (error) {
      storeUpdate(move.pageId, {
        section_id: page.section_id,
        parent_page_id: page.parent_page_id,
        sort_order: page.sort_order,
      });
    }
  }

  async function execSwap(moves: [MovePageInput, MovePageInput]) {
    for (const m of moves) {
      storeUpdate(m.pageId, {
        section_id: m.newSectionId,
        parent_page_id: m.newParentId,
        sort_order: m.newSortOrder,
      });
    }
    const results = await Promise.all(moves.map((m) => movePage(m)));
    if (results.some((r) => r.error)) {
      const origA = allPages.find((p) => p.id === moves[0].pageId);
      const origB = allPages.find((p) => p.id === moves[1].pageId);
      if (origA) storeUpdate(origA.id, { sort_order: origA.sort_order });
      if (origB) storeUpdate(origB.id, { sort_order: origB.sort_order });
    }
  }

  async function handleDelete() {
    onClose();
    storeRemove(page.id);
    const { error } = await trashPage(page.id);
    if (error) {
      const store = usePagesStore.getState();
      store.addPage(page);
    }
  }

  const items: (MenuItem | 'divider')[] = [
    {
      label: 'Add sub-page',
      icon: 'add',
      onPress: () => { onClose(); onAddSubPage(); },
    },
    'divider',
    {
      label: 'Indent',
      icon: 'format-indent-increase',
      onPress: async () => { onClose(); if (indentMove) await execMove(indentMove); },
      disabled: !indentMove || depth >= 5,
    },
    {
      label: 'Outdent',
      icon: 'format-indent-decrease',
      onPress: async () => { onClose(); if (outdentMove) await execMove(outdentMove); },
      disabled: !outdentMove,
    },
    {
      label: 'Move up',
      icon: 'arrow-upward',
      onPress: async () => { onClose(); if (moveUpMoves) await execSwap(moveUpMoves); },
      disabled: !moveUpMoves,
    },
    {
      label: 'Move down',
      icon: 'arrow-downward',
      onPress: async () => { onClose(); if (moveDownMoves) await execSwap(moveDownMoves); },
      disabled: !moveDownMoves,
    },
    'divider',
    {
      label: 'Move to section...',
      icon: 'drive-file-move',
      onPress: () => { onClose(); onMoveToSection(); },
    },
    'divider',
    {
      label: 'Rename',
      icon: 'edit',
      onPress: () => { onClose(); onRename(); },
    },
    {
      label: 'Delete',
      icon: 'delete',
      onPress: handleDelete,
      destructive: true,
    },
  ];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.menuWrapper,
            anchor ? { position: 'absolute', left: anchor.x, top: anchor.y } : {},
          ]}
        >
          <View style={styles.menu}>
            {items.map((item, i) => {
              if (item === 'divider') {
                return <View key={`div-${i}`} style={styles.divider} />;
              }
              return (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
                    item.disabled && { opacity: 0.4 },
                  ]}
                >
                  <Icon
                    name={item.icon as React.ComponentProps<typeof Icon>['name']}
                    size={16}
                    color={item.destructive ? colors.hpDanger : colors.onSurfaceVariant}
                  />
                  <Text
                    variant="label-md"
                    style={{
                      flex: 1,
                      color: item.destructive ? colors.hpDanger : colors.onSurface,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
