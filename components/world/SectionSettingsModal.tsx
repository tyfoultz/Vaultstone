import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { trashSection, updateSection } from '@vaultstone/api';
import { useSectionsStore } from '@vaultstone/store';
import type { WorldSection } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  section: WorldSection;
  onClose: () => void;
  onDeleted?: () => void;
};

// Gear-triggered settings for a section. Covers the Phase 4 visibility
// override pair (`force_hidden_from_players`, `default_pages_visible`)
// plus rename + view type + soft-delete, so it's a one-stop shop for
// everything a GM would want to do with an existing section.
//
// Rule: `force_hidden_from_players` is the trump card — when on, the
// section (and every page inside) is GM-only regardless of any
// per-page `visible_to_players` state. `default_pages_visible`
// only seeds the initial value when new pages are created here;
// it doesn't retroactively flip existing pages.
export function SectionSettingsModal({ section, onClose, onDeleted }: Props) {
  const storeUpdateSection = useSectionsStore((s) => s.updateSection);
  const storeRemoveSection = useSectionsStore((s) => s.removeSection);

  const [name, setName] = useState(section.name);
  const [view, setView] = useState<'grid' | 'list'>(section.section_view);
  const [forceHidden, setForceHidden] = useState(section.force_hidden_from_players);
  const [defaultVisible, setDefaultVisible] = useState(section.default_pages_visible);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const dirty =
    name.trim() !== section.name ||
    view !== section.section_view ||
    forceHidden !== section.force_hidden_from_players ||
    defaultVisible !== section.default_pages_visible;

  async function handleSave() {
    if (!name.trim()) {
      setError('Section name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const patch = {
      name: name.trim(),
      section_view: view,
      force_hidden_from_players: forceHidden,
      default_pages_visible: defaultVisible,
    };
    const { data, error: err } = await updateSection(section.id, patch);
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? 'Failed to save section.');
      return;
    }
    storeUpdateSection(section.id, patch);
    onClose();
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError('');
    const { error: err } = await trashSection(section.id);
    setDeleting(false);
    if (err) {
      setError(err.message);
      return;
    }
    storeRemoveSection(section.id);
    onClose();
    if (onDeleted) onDeleted();
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    Section settings
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {section.name}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={styles.body}>
                <Input
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Section name"
                />

                <View>
                  <MetaLabel size="sm">View</MetaLabel>
                  <View style={styles.chipRow}>
                    {(['grid', 'list'] as const).map((v) => {
                      const selected = view === v;
                      return (
                        <Pressable
                          key={v}
                          onPress={() => setView(v)}
                          style={[styles.selectChip, selected && styles.selectChipActive]}
                        >
                          <Text
                            variant="label-md"
                            uppercase
                            weight="semibold"
                            style={{
                              color: selected ? colors.primary : colors.onSurfaceVariant,
                              letterSpacing: 1,
                            }}
                          >
                            {v}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.toggleGroup}>
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Text variant="label-md" weight="semibold">
                        Hide entire section from players
                      </Text>
                      <Text variant="body-sm" tone="secondary" style={styles.toggleHelp}>
                        Every page inside stays GM-only, overriding any per-page
                        visibility setting.
                      </Text>
                    </View>
                    <Switch
                      value={forceHidden}
                      onValueChange={setForceHidden}
                      thumbColor={forceHidden ? colors.gm : colors.outline}
                      trackColor={{ false: colors.outlineVariant, true: colors.gmContainer }}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Text variant="label-md" weight="semibold">
                        New pages visible to players by default
                      </Text>
                      <Text variant="body-sm" tone="secondary" style={styles.toggleHelp}>
                        Seeds each new page's visibility. Existing pages
                        aren't retroactively changed.
                      </Text>
                    </View>
                    <Switch
                      value={defaultVisible}
                      onValueChange={setDefaultVisible}
                      thumbColor={defaultVisible ? colors.player : colors.outline}
                      trackColor={{
                        false: colors.outlineVariant,
                        true: colors.playerGlow,
                      }}
                      disabled={forceHidden}
                    />
                  </View>
                </View>

                <View style={styles.dangerZone}>
                  <MetaLabel size="sm" tone="muted">
                    Danger zone
                  </MetaLabel>
                  {confirmDelete ? (
                    <View style={styles.confirmRow}>
                      <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
                        Soft-delete this section and all its pages? Restore
                        from Recently Deleted within 30 days.
                      </Text>
                      <GhostButton
                        label="Cancel"
                        onPress={() => setConfirmDelete(false)}
                      />
                      <GradientButton
                        label={deleting ? 'Deleting…' : 'Delete'}
                        onPress={handleDelete}
                        loading={deleting}
                      />
                    </View>
                  ) : (
                    <Pressable onPress={handleDelete} style={styles.deleteBtn}>
                      <Icon name="delete-outline" size={16} color={colors.hpDanger} />
                      <Text
                        variant="label-md"
                        weight="semibold"
                        style={{ color: colors.hpDanger }}
                      >
                        Delete section
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{ color: colors.hpDanger, marginTop: spacing.md }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Close" onPress={onClose} />
                <GradientButton
                  label="Save changes"
                  onPress={handleSave}
                  loading={saving}
                  disabled={!dirty || saving}
                />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  body: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  selectChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  selectChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  toggleGroup: {
    marginTop: spacing.sm,
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleHelp: {
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  dangerZone: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
    gap: spacing.sm,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
