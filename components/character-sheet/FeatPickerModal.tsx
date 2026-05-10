// Catalog feat picker for the character sheet's "+ Feat" affordance.
// Replaces the freeform name/description modal that previously
// shipped on AbilitiesTab — players now pick from the system's feat
// catalog (SRD + any homebrew packs the character's campaign has
// enabled), and the same prereq checker the wizard uses gates
// candidate feats so a CON 9 character can't take a CON 13 feat.
//
// Prereq enforcement respects the character's campaign rule
// `enforce_feat_prerequisites`. Standalone characters (no campaign)
// fall through to the system default (true).

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ContentResolver } from '@vaultstone/content';
import { checkPrerequisites, type PrereqCharacter } from '@vaultstone/systems';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { Dnd5eFeature, Dnd5eStats, FeatResult } from '@vaultstone/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Snapshot of the character used for prereq gating. */
  stats: Dnd5eStats;
  /** Feats the character already has — excluded from the catalog. */
  existing: Dnd5eFeature[];
  /** Whether to enforce structured prereqs. Defaults to `true` when
   *  omitted (matches the campaign rule's default). */
  enforcePrereqs?: boolean;
  /** Optional homebrew pack ids the character pulls from (campaign
   *  packs are scoped via `campaignId`; standalone packs come in here). */
  campaignId?: string | null;
  packIds?: string[];
  /** Whether the character is in SRD 5.1 or 5.2 — drives the catalog filter. */
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
  /** Called with the resolved feat shape. The caller appends to
   *  `resources.feats[]` and persists. */
  onPick: (feature: Dnd5eFeature) => void;
};

export function FeatPickerModal({
  visible, onClose, stats, existing, enforcePrereqs = true,
  campaignId, packIds, srdVersion, onPick,
}: Props) {
  const [list, setList] = useState<FeatResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const character = useMemo<PrereqCharacter>(() => buildPrereqCharacter(stats), [stats]);
  const existingKeys = useMemo(() => new Set(existing.map((f) => f.id)), [existing]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSearch('');
    setPreviewKey(null);
    const includeHomebrew = !!campaignId || (packIds?.length ?? 0) > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'feat',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && packIds && packIds.length > 0 ? packIds : undefined,
    })
      .then((r) => setList(r as FeatResult[]))
      .finally(() => setLoading(false));
  }, [visible, srdVersion, campaignId, (packIds ?? []).join(',')]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter((f) => !existingKeys.has(f.key))
      .filter((f) => !q || f.name.toLowerCase().includes(q));
  }, [list, search, existingKeys]);

  const preview = previewKey ? list.find((f) => f.key === previewKey) : null;

  function commit(feat: FeatResult) {
    const feature: Dnd5eFeature = {
      id: feat.key,
      name: feat.name,
      description: [
        feat.description ?? '',
        ...(feat.benefits ?? []).map((b) => `• ${b}`),
      ].filter(Boolean).join('\n\n'),
    };
    onPick(feature);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title}>{preview ? preview.name : 'Add a feat'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : preview ? (
            <FeatDetail
              feat={preview}
              character={character}
              enforcePrereqs={enforcePrereqs}
              onBack={() => setPreviewKey(null)}
              onPick={() => commit(preview)}
            />
          ) : (
            <>
              <View style={s.searchRow}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search feats…"
                  placeholderTextColor={colors.outline}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {filtered.length === 0 ? (
                  <Text style={s.emptyText}>
                    {existingKeys.size > 0 && list.length > 0 && search.length === 0
                      ? 'You already have every available feat. Take more on level-up.'
                      : 'No matching feats.'}
                  </Text>
                ) : null}
                {filtered.map((f) => {
                  const check = checkPrerequisites(character, f.prerequisitesRaw);
                  const locked = enforcePrereqs && !check.ok;
                  return (
                    <Pressable
                      key={f.key}
                      style={[s.row, locked && s.rowLocked]}
                      onPress={() => setPreviewKey(f.key)}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.rowName}>{f.name}</Text>
                        {f.prerequisites ? (
                          <Text style={s.rowMeta} numberOfLines={1}>
                            {f.prerequisites}
                          </Text>
                        ) : null}
                        {locked && !check.ok ? (
                          <Text style={s.rowLockReason}>{check.reason}</Text>
                        ) : null}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FeatDetail({
  feat, character, enforcePrereqs, onBack, onPick,
}: {
  feat: FeatResult;
  character: PrereqCharacter;
  enforcePrereqs: boolean;
  onBack: () => void;
  onPick: () => void;
}) {
  const check = checkPrerequisites(character, feat.prerequisitesRaw);
  const locked = enforcePrereqs && !check.ok;
  return (
    <ScrollView contentContainerStyle={s.detailWrap}>
      <Pressable onPress={onBack} style={s.backLink}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={s.backText}>Back</Text>
      </Pressable>

      {feat.prerequisites ? (
        <View style={s.detailBlock}>
          <Text style={s.detailLabel}>PREREQUISITE</Text>
          <Text style={[s.detailValue, locked && s.detailValueLocked]}>
            {feat.prerequisites}
          </Text>
          {locked && !check.ok ? (
            <Text style={s.detailWarn}>{check.reason}</Text>
          ) : null}
        </View>
      ) : null}

      {feat.description ? (
        <Text style={s.detailDesc}>{feat.description}</Text>
      ) : null}

      {Array.isArray(feat.benefits) && feat.benefits.length > 0 ? (
        <View style={s.detailBlock}>
          <Text style={s.detailLabel}>BENEFITS</Text>
          {feat.benefits.map((b, i) => (
            <Text key={i} style={s.benefitItem}>• {b}</Text>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={[s.commitBtn, locked && s.commitBtnDisabled]}
        onPress={locked ? undefined : onPick}
        activeOpacity={locked ? 1 : 0.85}
      >
        <Text style={[s.commitText, locked && s.commitTextDisabled]}>
          {locked ? 'Prerequisites not met' : `Add ${feat.name}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function buildPrereqCharacter(stats: Dnd5eStats): PrereqCharacter {
  return {
    abilityScores: stats.abilityScores ?? {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    level: stats.level ?? 1,
    // The sheet's resources.feats / resources.classFeatures lists are
    // a richer source for class-feature gating than `stats` alone, but
    // gating on Spellcasting / Fighting Style features doesn't typically
    // fire at L1 (the prereq-bearing feats are mostly L4+/L19+). For
    // tighter checks the caller can pass an enriched character via a
    // future `classFeatures` prop.
    classFeatures: [],
  };
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    width: '100%', maxWidth: 560, maxHeight: '80%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, flex: 1, minWidth: 0,
  },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: fonts.body,
    color: colors.onSurface,
  },
  list: { maxHeight: 480 },
  emptyText: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    textAlign: 'center', paddingVertical: 24,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radius.lg,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  rowLocked: { opacity: 0.5 },
  rowName: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
  },
  rowMeta: {
    fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  rowLockReason: {
    fontSize: 10, fontFamily: fonts.label, color: colors.hpDanger,
    marginTop: 2, fontWeight: '600',
  },
  // Detail
  detailWrap: { paddingBottom: spacing.md },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  detailBlock: { marginTop: 12 },
  detailLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, marginBottom: 4,
  },
  detailValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },
  detailValueLocked: { color: colors.hpDanger },
  detailWarn: { fontSize: 11, fontFamily: fonts.body, color: colors.hpDanger, marginTop: 4 },
  detailDesc: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
    lineHeight: 19, marginTop: 12,
  },
  benefitItem: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, lineHeight: 18, marginBottom: 4 },
  commitBtn: {
    marginTop: spacing.lg, paddingVertical: 12,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  commitBtnDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitTextDisabled: { color: colors.outline },
});
