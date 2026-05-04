// Content packs row pinned above the SRD content tabs on the system
// detail page. Surfaces every non-SRD content source the user owns for
// this system — both authored homebrew packs (Supabase-backed,
// party-shareable) and imported JSON files (from the import modal).
// Two tiles at the end let users add more of either kind.
//
// Both kinds render as visually similar cards with kind-distinguishing
// icons + sublabels so users can tell them apart at a glance, while the
// unified surface keeps the mental model simple ("things that add
// content to my system"). Tap and delete diverge by kind — see PackCard.

import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  colors, spacing, radius,
  MetaLabel, Text, Icon,
} from '@vaultstone/ui';
import {
  listHomebrewPacks, deleteHomebrewPack, getPackCampaignUsage,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { GameSystemDefinition } from '@vaultstone/types';
import { CreateHomebrewPackModal } from '../homebrew/CreateHomebrewPackModal';
import { ImportContentModal } from '../imported/ImportContentModal';

type Props = {
  system: GameSystemDefinition;
  /** Bumped when a pack is created, deleted, or an import lands so the
   *  page-level homebrew hook re-fetches and downstream surfaces (Class
   *  detail, etc.) reflect the change without a remount. */
  onPacksChanged?: () => void;
};

type CampaignUsage = Map<string, Array<{ campaignId: string; campaignName: string }>>;

export function SystemPacksRow({ system, onPacksChanged }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [packs, setPacks] = useState<HomebrewPackRow[]>([]);
  const [usage, setUsage] = useState<CampaignUsage>(new Map());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await listHomebrewPacks({ system: system.id });
      if (cancelled) return;
      const list = data ?? [];
      setPacks(list);
      // Second round-trip for the per-pack campaign usage map. Sequential
      // (not Promise.all) because we need the pack ids before we can ask
      // — and a missing usage map just renders no chip, no crash.
      const usageMap = await getPackCampaignUsage(list.map((p) => p.id));
      if (!cancelled) setUsage(usageMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, system.id, refreshTick]);

  // While loading, render nothing — the SRD tabs immediately below are
  // self-contained, so a brief absence here is preferable to a flash of
  // an empty state that turns into populated content.
  if (loading) return null;

  function fanOutChange() {
    setRefreshTick((n) => n + 1);
    onPacksChanged?.();
  }

  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text variant="title-sm" family="headline" weight="bold" style={s.sectionTitle}>
          Your Content Packs
        </Text>
        <MetaLabel size="sm">
          {packs.length === 0 ? 'No packs yet' : `${packs.length} pack${packs.length === 1 ? '' : 's'}`}
        </MetaLabel>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
      >
        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            usage={usage.get(pack.id) ?? []}
            onOpen={() => router.push(`/homebrew-pack/${pack.id}` as Href)}
            onDeleted={() => {
              setPacks((prev) => prev.filter((p) => p.id !== pack.id));
              onPacksChanged?.();
            }}
          />
        ))}

        <Pressable
          onPress={() => setCreateOpen(true)}
          style={({ pressed }) => [s.newPackTile, pressed && { opacity: 0.85 }]}
        >
          <Icon name="auto-fix-high" size={18} color={colors.primary} />
          <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.primary }}>
            Create
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setImportOpen(true)}
          style={({ pressed }) => [s.newPackTile, pressed && { opacity: 0.85 }]}
        >
          <Icon name="upload-file" size={18} color={colors.primary} />
          <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.primary }}>
            Import
          </Text>
        </Pressable>
      </ScrollView>

      {createOpen ? (
        <CreateHomebrewPackModal
          system={system.id}
          systemDisplayName={system.displayName}
          onClose={() => setCreateOpen(false)}
          onCreated={(pack) => {
            setCreateOpen(false);
            setPacks((prev) => [pack, ...prev]);
            onPacksChanged?.();
            router.push(`/homebrew-pack/${pack.id}` as Href);
          }}
        />
      ) : null}

      <ImportContentModal
        visible={importOpen}
        systemId={system.id}
        onClose={() => setImportOpen(false)}
        onImported={fanOutChange}
      />
    </View>
  );
}

/**
 * Single content-pack card. Two-state body: the default shows name +
 * sublabel + trash; pressing trash flips into a confirm/cancel pair
 * inline (no separate modal, keeps the horizontal-scroll geometry stable).
 *
 * Imported packs (created via the import modal) and authored packs both
 * surface here as homebrew_packs rows — the storage convention is that
 * import-created packs are named "Imported: <filename>" so the user can
 * tell them apart in the row. Both kinds open the same per-pack detail
 * page on tap; the detail UI handles the authored-vs-imported rendering.
 */
function PackCard({
  pack,
  usage,
  onOpen,
  onDeleted,
}: {
  pack: HomebrewPackRow;
  /** Campaigns the pack is currently enabled on. Empty array → no usage chip. */
  usage: Array<{ campaignId: string; campaignName: string }>;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    const { error } = await deleteHomebrewPack(pack.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    onDeleted();
  }

  if (confirming) {
    return (
      <View style={[s.packCard, s.packCardConfirm]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.hpDanger }} numberOfLines={2}>
            {deleteError || `Delete "${pack.name}"?`}
          </Text>
          <MetaLabel size="sm">All entries inside the pack will be deleted.</MetaLabel>
        </View>
        <Pressable
          onPress={() => {
            setConfirming(false);
            setDeleteError('');
          }}
          style={[s.confirmBtn, s.confirmCancel]}
        >
          <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={[s.confirmBtn, s.confirmDelete]}
        >
          <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Imported packs are named "Imported: ..." by the import flow — surface
  // a different icon so the user can tell them apart in the row at a glance.
  const isImported = pack.name.startsWith('Imported: ');
  const iconName = isImported ? 'upload-file' : 'auto-fix-high';
  const sublabel = isImported ? 'Imported pack' : 'Authored pack';

  // Usage chip — "Used by N campaigns". The full campaign name list goes
  // on accessibilityLabel so screen readers announce it and (on web) it
  // surfaces via the title attribute on hover. Visible label is just the
  // count to keep the row tight.
  const usageNames = usage.map((u) => u.campaignName).join(', ');

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [s.packCard, pressed && { opacity: 0.85 }]}
    >
      <View style={s.packIcon}>
        <Icon name={iconName} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body-sm" family="headline" weight="bold" style={{ color: colors.onSurface }} numberOfLines={1}>
          {pack.name}
        </Text>
        <MetaLabel size="sm">{sublabel}</MetaLabel>
      </View>
      {usage.length > 0 ? (
        <View
          style={s.usageChip}
          accessibilityLabel={`Used by ${usageNames}`}
        >
          <Icon name="link" size={12} color={colors.onSurfaceVariant} />
          <Text variant="label-sm" family="body" weight="semibold" style={s.usageChipText}>
            {usage.length}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        style={s.packDeleteBtn}
        accessibilityLabel={`Delete ${pack.name}`}
      >
        <Icon name="delete" size={16} color={colors.onSurfaceVariant} />
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  row: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    minWidth: 240,
  },
  packIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPackTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    minWidth: 140,
    justifyContent: 'center',
  },
  packDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  usageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  usageChipText: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  packCardConfirm: {
    minWidth: 320,
    borderColor: colors.hpDanger + '55',
  },
  confirmBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  confirmCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  confirmDelete: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
});
