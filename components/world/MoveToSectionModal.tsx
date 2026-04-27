import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { movePage } from '@vaultstone/api';
import {
  filterPagesBySection,
  selectSectionsForWorld,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  page: WorldPage;
  worldId: string;
  onClose: () => void;
};

export function MoveToSectionModal({ page, worldId, onClose }: Props) {
  const allSections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const rawPages = usePagesStore((s) => s.byWorldId[worldId]);
  const storeUpdate = usePagesStore((s) => s.updatePage);

  const otherSections = useMemo(
    () => allSections.filter((s) => s.id !== page.section_id),
    [allSections, page.section_id],
  );

  async function handleMove(targetSectionId: string) {
    const sectionPages = filterPagesBySection(rawPages, targetSectionId);
    const rootPages = sectionPages.filter((p) => !p.parent_page_id);
    const newSortOrder = (rootPages.at(-1)?.sort_order ?? -1) + 1;

    storeUpdate(page.id, {
      section_id: targetSectionId,
      parent_page_id: null,
      sort_order: newSortOrder,
    });
    onClose();

    const { error } = await movePage({
      pageId: page.id,
      newSectionId: targetSectionId,
      newParentId: null,
      newSortOrder,
    });
    if (error) {
      storeUpdate(page.id, {
        section_id: page.section_id,
        parent_page_id: page.parent_page_id,
        sort_order: page.sort_order,
      });
    }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrapper}>
          <View style={styles.menu}>
            <MetaLabel size="sm" tone="muted" style={styles.kicker}>
              Move "{page.title}" to...
            </MetaLabel>

            {otherSections.length === 0 ? (
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ padding: spacing.sm }}
              >
                No other sections available.
              </Text>
            ) : (
              otherSections.map((section) => (
                <Pressable
                  key={section.id}
                  onPress={() => handleMove(section.id)}
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
                  ]}
                >
                  <Icon name="folder" size={16} color={colors.onSurfaceVariant} />
                  <Text variant="label-md" style={{ flex: 1, color: colors.onSurface }}>
                    {section.name}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  wrapper: {
    width: '100%',
    maxWidth: 340,
  },
  menu: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  kicker: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
});
