import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { movePage, trashPage, updatePage } from '@vaultstone/api';
import {
  selectSectionsForWorld,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { WorldPage, WorldSection } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  page: WorldPage;
  worldId: string;
  onClose: () => void;
};

type Action = 'relink' | 'rehome' | 'dismiss';

export function OrphanResolveModal({ page, worldId, onClose }: Props) {
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const removePage = usePagesStore((s) => s.removePage);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const otherSections = useMemo(
    () => sections.filter((s) => s.id !== page.section_id),
    [sections, page.section_id],
  );

  async function handleRelink() {
    setWorking(true);
    const { data } = await updatePage(page.id, { page_kind: 'custom' });
    if (data) {
      updatePageInStore(page.id, { page_kind: data.page_kind, is_orphaned: false });
    }
    setWorking(false);
    onClose();
  }

  async function handleRehome() {
    if (!targetSectionId) return;
    setWorking(true);
    await movePage({
      pageId: page.id,
      newSectionId: targetSectionId,
      newParentId: null,
      newSortOrder: 0,
    });
    updatePageInStore(page.id, { section_id: targetSectionId, parent_page_id: null, sort_order: 0 });
    setWorking(false);
    onClose();
  }

  async function handleDismiss() {
    if (!confirmDismiss) {
      setConfirmDismiss(true);
      return;
    }
    setWorking(true);
    await trashPage(page.id);
    removePage(page.id);
    setWorking(false);
    onClose();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalWrap} onPress={(e) => e.stopPropagation()}>
          <Card tier="highest" padding="lg" style={styles.card}>
            <View style={styles.header}>
              <Icon name="link-off" size={20} color={colors.hpWarning} />
              <Text variant="title-md" family="serif-display" weight="semibold">
                Resolve Orphaned Page
              </Text>
            </View>

            <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.lg }}>
              "{page.title}" lost its linked character or campaign. Choose how to handle it:
            </Text>

            {/* Option 1: Keep in Players as custom page */}
            <ActionOption
              icon="article"
              title="Keep as custom page"
              description="Convert to a regular handout page in the Players section."
              selected={selectedAction === 'relink'}
              onPress={() => setSelectedAction('relink')}
            />

            {/* Option 2: Move to another section */}
            <ActionOption
              icon="drive-file-move"
              title="Move to another section"
              description="Relocate this page to a different section of the world."
              selected={selectedAction === 'rehome'}
              onPress={() => setSelectedAction('rehome')}
            />

            {selectedAction === 'rehome' ? (
              <View style={styles.sectionPicker}>
                <MetaLabel size="sm" tone="muted" style={{ marginBottom: spacing.xs }}>
                  Choose destination section:
                </MetaLabel>
                {otherSections.map((sec) => (
                  <Pressable
                    key={sec.id}
                    onPress={() => setTargetSectionId(sec.id)}
                    style={[
                      styles.sectionRow,
                      targetSectionId === sec.id && styles.sectionRowSelected,
                    ]}
                  >
                    <Icon
                      name={targetSectionId === sec.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={16}
                      color={targetSectionId === sec.id ? colors.player : colors.outlineVariant}
                    />
                    <Text variant="body-sm" style={{ color: targetSectionId === sec.id ? colors.onSurface : colors.onSurfaceVariant }}>
                      {sec.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Option 3: Dismiss / delete */}
            <ActionOption
              icon="delete-outline"
              title="Dismiss (soft-delete)"
              description="Move to Recently Deleted. Recoverable for 30 days."
              selected={selectedAction === 'dismiss'}
              onPress={() => setSelectedAction('dismiss')}
              danger
            />

            {/* Action buttons */}
            <View style={styles.actions}>
              <GhostButton label="Cancel" onPress={onClose} />
              {selectedAction === 'relink' ? (
                <GradientButton label={working ? 'Saving…' : 'Convert to page'} onPress={handleRelink} disabled={working} />
              ) : selectedAction === 'rehome' ? (
                <GradientButton
                  label={working ? 'Moving…' : 'Move page'}
                  onPress={handleRehome}
                  disabled={working || !targetSectionId}
                />
              ) : selectedAction === 'dismiss' ? (
                <Pressable
                  onPress={handleDismiss}
                  style={[styles.dangerBtn, confirmDismiss && styles.dangerBtnConfirm]}
                  disabled={working}
                >
                  <Icon name="delete" size={14} color={colors.hpDanger} />
                  <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>
                    {confirmDismiss ? 'Confirm delete' : 'Delete'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionOption({ icon, title, description, selected, onPress, danger }: {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  const borderColor = selected
    ? danger ? colors.hpDanger + '55' : colors.player + '55'
    : colors.outlineVariant + '44';
  const bgColor = selected
    ? danger ? colors.dangerContainer + '22' : colors.playerContainer + '22'
    : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, { borderColor, backgroundColor: bgColor }]}
    >
      <Icon
        name={icon as React.ComponentProps<typeof Icon>['name']}
        size={18}
        color={danger ? colors.hpDanger : selected ? colors.player : colors.onSurfaceVariant}
      />
      <View style={{ flex: 1 }}>
        <Text variant="body-sm" weight="semibold" style={{ color: danger ? colors.hpDanger : colors.onSurface }}>
          {title}
        </Text>
        <Text variant="label-sm" style={{ color: colors.outline, marginTop: 1 }}>
          {description}
        </Text>
      </View>
      <Icon
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={18}
        color={selected ? (danger ? colors.hpDanger : colors.player) : colors.outlineVariant}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  sectionPicker: {
    marginLeft: spacing['2xl'],
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  sectionRowSelected: {
    backgroundColor: colors.playerContainer + '33',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hpDanger + '44',
  },
  dangerBtnConfirm: {
    backgroundColor: colors.dangerContainer + '44',
  },
});
