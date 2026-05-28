// DM-only modal for managing the campaign's content stack:
//   - System picker (locked once any character is linked to the campaign)
//   - Pack toggles for the DM's own packs in the active system
//
// Lives behind the "Manage" button on the campaign-side System Card. The
// "view"-only counterparts (View Game System / View Content Packs) are
// handled by their own actions on the same card; this modal is the
// editor surface.

import { useEffect, useState } from 'react';
import {
  Modal, Pressable, View, Text, TouchableOpacity,
  ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  updateCampaignSystem, getCharacters,
  listHomebrewPacks, listCampaignPacks,
  addPackToCampaign, removePackFromCampaign, setCampaignPackEnabled,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { BUNDLED_SYSTEMS_ORDER } from '@vaultstone/systems';
import { invalidateHomebrewCache } from '@vaultstone/content';
import { colors, spacing } from '@vaultstone/ui';

type Props = {
  visible: boolean;
  campaignId: string;
  /** Current system on the campaign — drives the picker's initial value
   *  and the pack list filter. */
  currentSystem: string;
  onClose: () => void;
  /** Fired after a save (system change or pack toggle) so the parent can
   *  refresh derived state — System Card pack count, etc. */
  onChanged?: () => void;
};

// System options come from the bundled-systems registry so adding a
// new system in @vaultstone/systems automatically surfaces it here.
const SYSTEM_OPTIONS = BUNDLED_SYSTEMS_ORDER.map((s) => ({
  id: s.id,
  label: s.displayName,
}));

/**
 * Per-pack row state. We track which of the DM's packs are currently
 * attached to this campaign (and whether enabled) so the toggle UX can
 * differentiate "not added yet" from "added but disabled".
 */
type PackRowState = {
  pack: HomebrewPackRow;
  /** Currently in campaign_packs for this campaign? */
  attached: boolean;
  /** Enabled in campaign_packs (only meaningful when attached). */
  enabled: boolean;
};

export function ManageCampaignContentModal({
  visible, campaignId, currentSystem, onClose, onChanged,
}: Props) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // System state
  const [system, setSystem] = useState(currentSystem);
  const [characterCount, setCharacterCount] = useState(0);
  const [savingSystem, setSavingSystem] = useState(false);

  // Pack state — every pack the DM owns for the *active* (selected) system,
  // overlaid with attachment / enabled-flag state. Re-fetched when the
  // system selection changes so the list always reflects the right scope.
  const [packs, setPacks] = useState<PackRowState[]>([]);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  const systemLocked = characterCount > 0;

  useEffect(() => {
    if (!visible) return;
    setSystem(currentSystem);
    setError(null);
  }, [visible, currentSystem]);

  // Load characters once when the modal opens — the count drives the
  // system-picker lock state and doesn't change while the modal is open
  // (no character-creation flow is reachable from inside).
  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    getCharacters(campaignId).then(({ data }) => {
      if (cancelled) return;
      setCharacterCount((data ?? []).length);
    });
    return () => { cancelled = true; };
  }, [visible, campaignId, userId]);

  // Load packs whenever the selected system changes. Two parallel queries:
  // every pack the DM owns for this system, and every pack already
  // attached to the campaign. Merge into the PackRowState view-model.
  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listHomebrewPacks({ system }),
      listCampaignPacks(campaignId),
    ]).then(([packsRes, attachedRes]) => {
      if (cancelled) return;
      const ownPacks = (packsRes.data ?? []).filter((p) => p.owner_user_id === userId);
      const attachedById = new Map<string, { enabled: boolean }>();
      for (const row of attachedRes.data ?? []) {
        attachedById.set(row.pack_id, { enabled: row.enabled });
      }
      const merged: PackRowState[] = ownPacks.map((p) => {
        const attached = attachedById.get(p.id);
        return {
          pack: p,
          attached: !!attached,
          enabled: attached?.enabled ?? false,
        };
      });
      setPacks(merged);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Failed to load packs.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [visible, system, campaignId, userId]);

  async function handleSelectSystem(targetSystem: string) {
    if (systemLocked) return;
    if (targetSystem === system) return;
    setSavingSystem(true);
    setError(null);
    const { error: err } = await updateCampaignSystem(campaignId, targetSystem);
    setSavingSystem(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSystem(targetSystem);
    onChanged?.();
  }

  async function handleTogglePack(row: PackRowState) {
    if (pendingPackId) return;
    setPendingPackId(row.pack.id);
    setError(null);

    if (!row.attached) {
      // Not yet in the join table — add it (RLS enforces the inserter is
      // both the DM and the pack owner; we already gate on owner above
      // by filtering the pack list).
      const { error: err } = await addPackToCampaign({
        campaignId,
        packId: row.pack.id,
      });
      if (err) {
        setError(err.message);
      } else {
        invalidateHomebrewCache();
        setPacks((prev) => prev.map((p) =>
          p.pack.id === row.pack.id ? { ...p, attached: true, enabled: true } : p,
        ));
        onChanged?.();
      }
    } else {
      // Already attached — flip enabled. Toggling off keeps the join
      // row so settings (future per-pack overrides) survive a re-enable.
      const next = !row.enabled;
      const { error: err } = await setCampaignPackEnabled(campaignId, row.pack.id, next);
      if (err) {
        setError(err.message);
      } else {
        invalidateHomebrewCache();
        setPacks((prev) => prev.map((p) =>
          p.pack.id === row.pack.id ? { ...p, enabled: next } : p,
        ));
        onChanged?.();
      }
    }
    setPendingPackId(null);
  }

  async function handleRemovePack(row: PackRowState) {
    if (pendingPackId) return;
    setPendingPackId(row.pack.id);
    setError(null);
    const { error: err } = await removePackFromCampaign(campaignId, row.pack.id);
    if (err) {
      setError(err.message);
    } else {
      invalidateHomebrewCache();
      setPacks((prev) => prev.map((p) =>
        p.pack.id === row.pack.id ? { ...p, attached: false, enabled: false } : p,
      ));
      onChanged?.();
    }
    setPendingPackId(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title}>Manage Campaign Content</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scrollBody}>
            {/* ── System picker ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Game System</Text>
              {systemLocked ? (
                <Text style={s.lockNote}>
                  System is locked because {characterCount} character{characterCount === 1 ? '' : 's'}
                  {' '}{characterCount === 1 ? 'is' : 'are'} linked to this campaign. Switching systems
                  would invalidate their per-character system tags.
                </Text>
              ) : null}

              {SYSTEM_OPTIONS.map((opt) => {
                const selected = opt.id === system;
                // Custom system authoring isn't built yet — gate the row.
                // Existing campaigns already on Custom can still see the
                // selected state but can't switch elsewhere mid-thread; new
                // campaigns can't switch INTO Custom.
                const comingSoon = opt.id === 'custom' && !selected;
                const disabled = systemLocked || savingSystem || comingSoon;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => handleSelectSystem(opt.id)}
                    disabled={disabled}
                    style={[s.systemRow, selected && s.systemRowSelected, disabled && !selected && s.systemRowDisabled]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={selected ? colors.brand : colors.textSecondary}
                    />
                    <Text style={[s.systemLabel, selected && s.systemLabelSelected]}>
                      {opt.label}
                    </Text>
                    {comingSoon ? (
                      <Text style={s.comingSoonTag}>COMING SOON</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Pack toggles ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Content Packs</Text>
              {loading ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator color={colors.brand} />
                </View>
              ) : packs.length === 0 ? (
                <Text style={s.emptyText}>
                  You don't have any content packs for this system yet. Create
                  or import one from Game Systems → {SYSTEM_OPTIONS.find((opt) => opt.id === system)?.label ?? system}.
                </Text>
              ) : (
                packs.map((row) => (
                  <View key={row.pack.id} style={s.packRow}>
                    <TouchableOpacity
                      onPress={() => handleTogglePack(row)}
                      disabled={pendingPackId === row.pack.id}
                      style={s.packToggleHit}
                    >
                      <MaterialCommunityIcons
                        name={
                          row.attached && row.enabled
                            ? 'checkbox-marked'
                            : 'checkbox-blank-outline'
                        }
                        size={22}
                        color={row.attached && row.enabled ? colors.brand : colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.packName} numberOfLines={1}>{row.pack.name}</Text>
                        <Text style={s.packMeta}>
                          {row.attached
                            ? row.enabled ? 'Enabled in this campaign' : 'Added but disabled'
                            : 'Not added'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {row.attached ? (
                      <TouchableOpacity
                        onPress={() => handleRemovePack(row)}
                        disabled={pendingPackId === row.pack.id}
                        style={s.removeBtn}
                        accessibilityLabel={`Remove ${row.pack.name} from campaign`}
                      >
                        <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {error ? (
              <View style={s.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.hpDanger} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    // Center the panel horizontally on wide viewports so the modal
    // doesn't stretch to viewport-edge on desktop.
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    maxHeight: '90%',
    // Width cap matches the rest of our modals (rules editor, link
    // world). Mobile viewports take the full width via 100% before
    // the cap kicks in.
    width: '100%',
    maxWidth: 640,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  scrollBody: { padding: spacing.lg, gap: spacing.lg },

  section: { gap: spacing.sm },
  sectionLabel: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 4,
  },

  // System picker
  lockNote: {
    fontSize: 12, color: colors.textSecondary, lineHeight: 17,
    padding: spacing.sm, borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  systemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2,
    borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  systemRowSelected: {
    borderColor: colors.brand + '88',
    backgroundColor: colors.brand + '11',
  },
  systemRowDisabled: { opacity: 0.4 },
  systemLabel: { fontSize: 14, color: colors.textSecondary },
  systemLabelSelected: { color: colors.textPrimary, fontWeight: '600' },
  comingSoonTag: {
    fontSize: 9,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    letterSpacing: 0.6,
    marginLeft: 'auto',
    fontWeight: '600',
  },

  // Packs
  loadingWrap: { padding: spacing.lg, alignItems: 'center' },
  emptyText: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
    padding: spacing.sm,
  },
  packRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
  },
  packToggleHit: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  packName: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  packMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  removeBtn: { padding: spacing.xs },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.sm + 2, borderRadius: 8,
    borderWidth: 1, borderColor: colors.hpDanger + '66',
    backgroundColor: colors.hpDanger + '11',
  },
  errorText: { flex: 1, color: colors.hpDanger, fontSize: 12, lineHeight: 17 },
});
