import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  createHomebrewPack,
  getCampaigns,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  Card,
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

type Campaign = Database['public']['Tables']['campaigns']['Row'];

type Props = {
  onClose: () => void;
  onCreated: (pack: HomebrewPackRow) => void;
};

export function CreateHomebrewPackModal({ onClose, onCreated }: Props) {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // null = personal library (default); a campaign id = scoped to that campaign.
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getCampaigns().then(({ data }) => {
      // Only the user's own (DM) campaigns can host packs they own.
      const dmOnly = (data ?? []).filter(
        (c) => c.dm_user_id === user.id && !c.is_archived,
      );
      setMyCampaigns(dmOnly);
    });
  }, [user]);

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) {
      setError('Pack name is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    const { data, error: err } = await createHomebrewPack({
      ownerUserId: user.id,
      name: name.trim(),
      description: description.trim() || null,
      campaignId,
    });

    setSubmitting(false);

    if (err || !data) {
      setError(err?.message ?? 'Failed to create pack.');
      return;
    }
    onCreated(data);
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
                    New homebrew pack
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    Create a pack
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Input
                  label="Pack name"
                  placeholder="House Rules — Power Word: Stub"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
                <Input
                  label="Description (optional)"
                  placeholder="What's in this pack and where it's intended to be used."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <SectionHeader title="Scope" meta="Where this pack lives" />
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setCampaignId(null)}
                    style={[
                      styles.selectChip,
                      campaignId === null && styles.selectChipActive,
                    ]}
                  >
                    {campaignId === null ? (
                      <Icon name="check" size={14} color={colors.primary} />
                    ) : null}
                    <Text
                      variant="label-md"
                      weight="semibold"
                      uppercase
                      style={{
                        color:
                          campaignId === null ? colors.primary : colors.onSurfaceVariant,
                        letterSpacing: 1,
                      }}
                    >
                      Personal library
                    </Text>
                  </Pressable>
                  {myCampaigns.map((c) => {
                    const selected = campaignId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setCampaignId(c.id)}
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
                            color: selected ? colors.primary : colors.onSurfaceVariant,
                            letterSpacing: 1,
                          }}
                        >
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text
                  variant="body-sm"
                  tone="secondary"
                  style={{ marginTop: spacing.sm, color: colors.onSurfaceVariant }}
                >
                  {campaignId === null
                    ? 'Personal packs live in your library and can be enabled in any of your campaigns.'
                    : "Campaign-scoped packs are only available in that campaign and can be shared with the campaign's players."}
                </Text>
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
                  label="Create pack"
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
