// Campaign content-packs card. DM sees toggleable list of attached packs +
// a picker to add eligible ones from their library. Players see the same
// list read-only — they need to know what custom content applies before
// rolling characters.
//
// Mounted on the campaign detail page (app/campaign/[id]/index.tsx) just
// below the System card. Wraps the campaign-packs API + a small inline
// add-modal so the card is self-contained.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import {
  listCampaignPacks,
  setCampaignPackEnabled,
  removePackFromCampaign,
  addPackToCampaign,
  listEligiblePacksForCampaign,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  Card,
  Chip,
  GhostButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type AttachedPack = {
  campaign_id: string;
  pack_id: string;
  enabled: boolean;
  added_at: string;
  homebrew_packs: HomebrewPackRow;
};

type Props = {
  campaignId: string;
  campaignSystem: string;
  isDM: boolean;
  /** Optional callback fired after toggle / add / remove so the parent
   *  page can refresh derived state (e.g. the System Card's "N enabled"
   *  count). The card still owns its own list state. */
  onChanged?: () => void;
};

export function CampaignPacksCard({ campaignId, campaignSystem, isDM, onChanged }: Props) {
  const user = useAuthStore((s) => s.user);
  const [packs, setPacks] = useState<AttachedPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCampaignPacks(campaignId).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError('Failed to load packs.');
      else setPacks((data as unknown as AttachedPack[]) ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  async function handleToggle(pack: AttachedPack) {
    const newValue = !pack.enabled;
    // Optimistic flip; rollback on error.
    setPacks((prev) =>
      prev.map((p) => (p.pack_id === pack.pack_id ? { ...p, enabled: newValue } : p)),
    );
    const { error: err } = await setCampaignPackEnabled(campaignId, pack.pack_id, newValue);
    if (err) {
      setPacks((prev) =>
        prev.map((p) => (p.pack_id === pack.pack_id ? { ...p, enabled: !newValue } : p)),
      );
      return;
    }
    onChanged?.();
  }

  async function handleRemove(pack: AttachedPack) {
    const { error: err } = await removePackFromCampaign(campaignId, pack.pack_id);
    if (err) return;
    setPacks((prev) => prev.filter((p) => p.pack_id !== pack.pack_id));
    onChanged?.();
  }

  async function handleAdd(packId: string) {
    const { data, error: err } = await addPackToCampaign({ campaignId, packId });
    if (err || !data) return;
    // Re-fetch so we get the joined homebrew_packs payload alongside the
    // new row — the bare insert response only carries the join columns.
    const refreshed = await listCampaignPacks(campaignId);
    if (refreshed.data) setPacks(refreshed.data as unknown as AttachedPack[]);
    setAddOpen(false);
    onChanged?.();
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="auto-fix-high" size={20} color={colors.primary} />
        <Text variant="title-sm" family="headline" weight="bold" style={{ flex: 1 }}>
          Content Packs
        </Text>
        {isDM ? (
          <GhostButton label="Add pack" icon="add" onPress={() => setAddOpen(true)} />
        ) : null}
      </View>

      {loading ? (
        <Text variant="body-sm" tone="secondary">Loading…</Text>
      ) : error ? (
        <Text variant="body-sm" style={{ color: colors.hpDanger }}>{error}</Text>
      ) : packs.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          {isDM
            ? 'No homebrew packs attached. Add one to make custom species, classes, items, spells, and more available to players in this campaign.'
            : 'The DM hasn’t attached any homebrew packs to this campaign — only the SRD ruleset is in play.'}
        </Text>
      ) : (
        <View style={styles.packList}>
          {packs.map((p) => (
            <View key={p.pack_id} style={styles.packRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body-md" weight="bold" style={{ color: colors.onSurface }}>
                  {p.homebrew_packs.name}
                </Text>
                {p.homebrew_packs.description ? (
                  <Text variant="body-sm" tone="secondary" numberOfLines={2}>
                    {p.homebrew_packs.description}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  {!p.enabled ? <Chip label="Disabled" variant="meta" /> : null}
                </View>
              </View>

              {isDM ? (
                <View style={styles.packActions}>
                  <Pressable
                    onPress={() => handleToggle(p)}
                    style={styles.actionBtn}
                    accessibilityLabel={p.enabled ? `Disable ${p.homebrew_packs.name}` : `Enable ${p.homebrew_packs.name}`}
                  >
                    <Icon
                      name={p.enabled ? 'check-box' : 'check-box-outline-blank'}
                      size={20}
                      color={p.enabled ? colors.primary : colors.outline}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemove(p)}
                    style={styles.actionBtn}
                    accessibilityLabel={`Remove ${p.homebrew_packs.name}`}
                  >
                    <Icon name="delete" size={18} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ) : (
                <Chip label={p.enabled ? 'Active' : 'Off'} variant={p.enabled ? 'accent' : 'meta'} />
              )}
            </View>
          ))}
        </View>
      )}

      {addOpen && user ? (
        <AddPackModal
          campaignId={campaignId}
          system={campaignSystem}
          ownerUserId={user.id}
          onClose={() => setAddOpen(false)}
          onAdd={handleAdd}
        />
      ) : null}
    </View>
  );
}

function AddPackModal({
  campaignId,
  system,
  ownerUserId,
  onClose,
  onAdd,
}: {
  campaignId: string;
  system: string;
  ownerUserId: string;
  onClose: () => void;
  onAdd: (packId: string) => void;
}) {
  const [eligible, setEligible] = useState<HomebrewPackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEligiblePacksForCampaign({ campaignId, system, ownerUserId }).then(({ data }) => {
      setEligible(data);
      setLoading(false);
    });
  }, [campaignId, system, ownerUserId]);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalWrap}>
          <Card tier="container" padding="lg">
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <MetaLabel size="sm" tone="accent">Attach pack</MetaLabel>
                <Text variant="headline-sm" family="headline" weight="bold" style={{ marginTop: 4 }}>
                  Add to campaign
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            {loading ? (
              <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.md }}>
                Loading…
              </Text>
            ) : eligible.length === 0 ? (
              <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.md }}>
                No eligible packs. Create a homebrew pack tagged for this system in
                Game Systems first.
              </Text>
            ) : (
              <View style={{ marginTop: spacing.md, gap: spacing.xs + 2 }}>
                {eligible.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => onAdd(p.id)}
                    style={({ pressed }) => [
                      styles.eligibleRow,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body-md" weight="bold">{p.name}</Text>
                      {p.description ? (
                        <Text variant="body-sm" tone="secondary" numberOfLines={2}>
                          {p.description}
                        </Text>
                      ) : (
                        <MetaLabel size="sm">Content pack</MetaLabel>
                      )}
                    </View>
                    <Icon name="add" size={20} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  packList: {
    gap: spacing.sm,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  packActions: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalWrap: {
    width: '100%',
    maxWidth: 520,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainerHigh,
  },
});
