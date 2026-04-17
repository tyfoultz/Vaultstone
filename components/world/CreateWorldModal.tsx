import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createWorld, getCampaigns } from '@vaultstone/api';
import { useAuthStore, useWorldsStore } from '@vaultstone/store';
import {
  Card,
  Chip,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  SectionHeader,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];

type Props = {
  onClose: () => void;
  onCreated: (world: World) => void;
};

export function CreateWorldModal({ onClose, onCreated }: Props) {
  const user = useAuthStore((s) => s.user);
  const addWorld = useWorldsStore((s) => s.addWorld);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getCampaigns().then(({ data }) => {
      const dmOnly = (data ?? []).filter(
        (c) => c.dm_user_id === user.id && !c.is_archived,
      );
      setMyCampaigns(dmOnly);
    });
  }, [user]);

  function toggleCampaign(id: string) {
    setLinkedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('World name is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    const { data, error: err } = await createWorld(name, {
      description: description.trim() || undefined,
      campaignIds: linkedIds,
    });

    setSubmitting(false);

    if (err || !data) {
      setError(err?.message ?? 'Failed to create world.');
      return;
    }
    addWorld(data as World);
    onCreated(data as World);
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
                    New chronicle
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    Create a world
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Input
                  label="World name"
                  placeholder="The Realm of Eldoria"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
                <Input
                  label="Description (optional)"
                  placeholder="A dying sun, a fractured moon, and the long dusk between…"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <SectionHeader title="Link campaigns" meta="Optional" />
                {myCampaigns.length === 0 ? (
                  <Text
                    variant="body-sm"
                    tone="secondary"
                    style={{ marginTop: spacing.xs, color: colors.onSurfaceVariant }}
                  >
                    You're not running any campaigns yet — you can create a
                    standalone world and link campaigns later.
                  </Text>
                ) : (
                  <View style={styles.chipRow}>
                    {myCampaigns.map((c) => {
                      const selected = linkedIds.includes(c.id);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => toggleCampaign(c.id)}
                          style={[
                            styles.selectChip,
                            selected && styles.selectChipActive,
                          ]}
                        >
                          {selected ? (
                            <Icon name="check" size={14} color={colors.primary} />
                          ) : null}
                          <Text
                            variant="label-md"
                            weight="semibold"
                            uppercase
                            style={{
                              color: selected
                                ? colors.primary
                                : colors.onSurfaceVariant,
                              letterSpacing: 1,
                            }}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{
                    color: colors.hpDanger,
                    marginTop: spacing.md,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label="Create world"
                  onPress={handleSubmit}
                  loading={submitting}
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
