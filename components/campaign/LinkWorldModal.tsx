// DM-side picker for linking a world to a campaign during setup.
//
// The user can either:
//   • Pick an existing world they own (or have member access to) and
//     link it via `linkWorldToCampaign`.
//   • Create a new world and link in one round-trip via
//     `createWorld({ campaignIds: [campaignId] })`.
//
// Either path closes the modal and triggers the parent's refresh
// callback so the V2 page re-reads the linked-world fallback chain.
//
// Spec is one-world-per-campaign: if the campaign is already linked
// to a world, the modal shows the linked entry as a managed state
// instead of letting the user pick a second one.

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  createWorld,
  getWorlds,
  linkWorldToCampaign,
  type WorldRow,
} from '@vaultstone/api';
import {
  Card, GhostButton, GradientButton, Icon, Input, MetaLabel, Text,
  colors, radius, spacing,
} from '@vaultstone/ui';

type Props = {
  campaignId: string;
  /** Already-linked world, when one exists. Surfaced as a managed
   *  state so the modal can communicate "you already have a world
   *  linked" without offering to pick a second one. Null when no
   *  world is linked yet (the typical setup-mode case). */
  currentWorld: { id: string; name: string } | null;
  onClose: () => void;
  onLinked: () => void;
};

export function LinkWorldModal({ campaignId, currentWorld, onClose, onLinked }: Props) {
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Create-mode form state.
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getWorlds();
      if (cancelled) return;
      setWorlds((data ?? []) as WorldRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handlePick(worldId: string) {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const { error: err } = await linkWorldToCampaign(worldId, campaignId);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onLinked();
    onClose();
  }

  async function handleCreate() {
    if (submitting) return;
    if (!newName.trim()) {
      setError('Give the new world a name.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: err } = await createWorld(newName.trim(), {
      campaignIds: [campaignId],
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onLinked();
    onClose();
  }

  const alreadyLinked = !!currentWorld;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">Campaign setup</MetaLabel>
                  <Text variant="headline-sm" family="headline" weight="bold" style={{ marginTop: 4 }}>
                    {alreadyLinked ? 'World linked' : 'Choose a world'}
                  </Text>
                  <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
                    Each campaign is set in one world. The world's lore, NPCs,
                    locations, and pinned imagery flow into the campaign hub
                    once you've linked it.
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {alreadyLinked ? (
                <View style={styles.linkedRow}>
                  <Icon name="check-circle" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body-md" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                      {currentWorld!.name}
                    </Text>
                    <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                      To swap to a different world, unlink this one first from the world's settings.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.modeRow}>
                    <ModeChip
                      label="Pick existing"
                      active={mode === 'pick'}
                      onPress={() => setMode('pick')}
                    />
                    <ModeChip
                      label="Create new"
                      active={mode === 'create'}
                      onPress={() => setMode('create')}
                    />
                  </View>

                  {mode === 'pick' ? (
                    <View style={styles.list}>
                      {loading ? (
                        <Text variant="body-sm" style={{ color: colors.outline }}>Loading…</Text>
                      ) : worlds.length === 0 ? (
                        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
                          You don't have any worlds yet. Switch to Create new to make one.
                        </Text>
                      ) : (
                        worlds.map((w) => (
                          <Pressable
                            key={w.id}
                            onPress={() => handlePick(w.id)}
                            disabled={submitting}
                            style={({ pressed }) => [
                              styles.row,
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <View style={styles.rowIcon}>
                              <Icon name="public" size={20} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text variant="body-md" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                                {w.name}
                              </Text>
                              {w.description ? (
                                <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
                                  {w.description}
                                </Text>
                              ) : null}
                            </View>
                            <Icon name="chevron-right" size={18} color={colors.outline} />
                          </Pressable>
                        ))
                      )}
                    </View>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      <Input
                        label="World name"
                        placeholder="e.g. Faerûn, Eberron, Your Setting"
                        value={newName}
                        onChangeText={setNewName}
                        autoFocus
                      />
                    </View>
                  )}
                </>
              )}

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label={alreadyLinked ? 'Close' : 'Cancel'} onPress={onClose} />
                {!alreadyLinked && mode === 'create' ? (
                  <GradientButton
                    label={submitting ? 'Creating…' : 'Create & link'}
                    onPress={handleCreate}
                    loading={submitting}
                  />
                ) : null}
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModeChip({
  label, active, onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeChip,
        active && styles.modeChipActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        variant="label-sm"
        family="body"
        weight={active ? 'bold' : 'medium'}
        style={{ color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant }}
      >
        {label}
      </Text>
    </Pressable>
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
  panelWrapper: { width: '100%', maxWidth: 560, maxHeight: '90%' },
  panel: {
    // Inherit the wrapper's height bound so the inner ScrollView
    // can scroll when the world list grows past the viewport.
    flex: 1,
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
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  modeChipActive: {
    backgroundColor: colors.primaryContainer + '55',
    borderColor: colors.primary + '88',
  },
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
