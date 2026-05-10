// L1 feat picker. Mounted only when the campaign rule
// `feats_at_level_1` is on (or in standalone mode where the rule
// defaults to the system default — currently true). Filtered to
// origin-category feats since this is the slot the 2024 SRD calls
// out at L1 for every character; 5.1 + house-rule campaigns reuse
// the same picker shape.
//
// Prereq enforcement is gated by the campaign rule
// `enforce_feat_prerequisites`. When on, locked feats are
// non-selectable with a short reason chip; when off, every feat is
// selectable (the player accepts whatever the campaign allows).

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { checkPrerequisites, type PrereqCharacter } from '@vaultstone/systems';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eAbilityScores, FeatResult } from '@vaultstone/types';

interface Props {
  onPreviewChange?: (inPreview: boolean) => void;
  onAdvance?: () => void;
}

export function StepFeats({ onPreviewChange, onAdvance }: Props) {
  const {
    srdVersion, chosenFeats, abilityScores, startingLevel,
    setChosenFeats, campaignId, selectedPackIds, campaignRules,
  } = useCharacterDraftStore(
    useShallow((s) => ({
      srdVersion: s.srdVersion,
      chosenFeats: s.chosenFeats,
      abilityScores: s.abilityScores,
      startingLevel: s.startingLevel,
      setChosenFeats: s.setChosenFeats,
      campaignId: s.campaignId,
      selectedPackIds: s.selectedPackIds,
      campaignRules: s.campaignRules,
    }))
  );

  const [list, setList] = useState<FeatResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const packIdsKey = selectedPackIds.join(',');

  const enforcePrereqs = campaignRules.enforce_feat_prerequisites !== false;

  useEffect(() => {
    const includeHomebrew = !!campaignId || selectedPackIds.length > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'feat',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && selectedPackIds.length > 0 ? selectedPackIds : undefined,
    })
      .then((r) => {
        const all = r as FeatResult[];
        // L1 picker shows origin-category feats. General / fighting-style /
        // epic-boon feats unlock later (ASI swaps, fighting-style features,
        // or L19+); the wizard surfaces those in the level-up flow when
        // it lands.
        setList(all.filter((f) => f.category === 'origin'));
      })
      .finally(() => setLoading(false));
  }, [srdVersion, campaignId, packIdsKey]);

  useEffect(() => { onPreviewChange?.(!!previewKey); }, [previewKey]);

  const character = useMemo<PrereqCharacter>(() => buildPrereqCharacter(abilityScores, startingLevel), [abilityScores, startingLevel]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator color={colors.primary} /></View>;
  }

  const preview = previewKey ? list.find((f) => f.key === previewKey) : null;

  if (preview) {
    const isChosen = chosenFeats.includes(preview.key);
    const check = checkPrerequisites(character, preview.prerequisitesRaw);
    const locked = enforcePrereqs && !check.ok;

    return (
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backLink} onPress={() => setPreviewKey(null)}>
          <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
          <Text style={s.backLinkText}>All Feats</Text>
        </TouchableOpacity>

        <View style={s.detailHeader}>
          <View style={s.detailIcon}>
            <MaterialCommunityIcons name="star-four-points" size={32} color={colors.primary} />
          </View>
          <View style={s.detailTitleWrap}>
            <Text style={s.detailTitle}>{preview.name}</Text>
            {preview.category ? (
              <Text style={s.detailSubtitle}>{capitalize(preview.category.replace('-', ' '))}</Text>
            ) : null}
          </View>
        </View>

        {preview.prerequisites ? (
          <View style={s.prereqBlock}>
            <Text style={s.prereqLabel}>PREREQUISITE</Text>
            <Text style={[s.prereqValue, locked && s.prereqValueLocked]}>
              {preview.prerequisites}
            </Text>
            {locked && !check.ok ? (
              <Text style={s.prereqWarn}>{check.reason}</Text>
            ) : null}
          </View>
        ) : null}

        {preview.description ? (
          <Text style={s.detailDesc}>{preview.description}</Text>
        ) : null}

        {Array.isArray(preview.benefits) && preview.benefits.length > 0 ? (
          <View style={s.benefits}>
            <Text style={s.sectionLabel}>BENEFITS</Text>
            {preview.benefits.map((b, i) => (
              <Text key={i} style={s.benefitItem}>• {b}</Text>
            ))}
          </View>
        ) : null}

        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          locked={locked}
          lockReason={locked && !check.ok ? check.reason : undefined}
          commitLabel={`Choose ${preview.name}`}
          onCommit={() => {
            setChosenFeats([preview.key]);
            onAdvance?.();
          }}
          onDeselect={() => {
            setChosenFeats(chosenFeats.filter((k) => k !== preview.key));
            setPreviewKey(null);
          }}
          onContinue={isChosen ? onAdvance : undefined}
          onCancel={() => setPreviewKey(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Pick a starting feat</Text>
      <Text style={s.guidance}>
        Origin feats represent the unique edge your character brings to the
        adventuring life. {list.length} available.
      </Text>
      {!enforcePrereqs ? (
        <Text style={s.relaxedNote}>
          This campaign waives feat prerequisites — every feat is selectable.
        </Text>
      ) : null}

      <View style={s.list}>
        {list.map((f) => {
          const selected = chosenFeats.includes(f.key);
          const check = checkPrerequisites(character, f.prerequisitesRaw);
          const locked = enforcePrereqs && !check.ok;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.card, selected && s.cardSelected, locked && s.cardLocked]}
              onPress={() => setPreviewKey(f.key)}
              activeOpacity={0.85}
            >
              <View style={s.cardInner}>
                <View style={[s.iconBox, selected && s.iconBoxSelected]}>
                  <MaterialCommunityIcons
                    name="star-four-points"
                    size={22}
                    color={selected ? colors.primary : colors.onSurfaceVariant}
                  />
                </View>
                <View style={s.cardText}>
                  <View style={s.nameRow}>
                    <Text style={s.cardName}>{f.name}</Text>
                    {selected ? (
                      <View style={s.pip}>
                        <MaterialCommunityIcons name="check" size={10} color={colors.onPrimary} />
                      </View>
                    ) : null}
                    {locked ? (
                      <Text style={s.lockTag}>{check.ok ? '' : check.reason}</Text>
                    ) : null}
                  </View>
                  {f.prerequisites ? (
                    <Text style={s.cardBlurb} numberOfLines={1}>{f.prerequisites}</Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function buildPrereqCharacter(
  abilityScores: Dnd5eAbilityScores | null,
  level: number,
): PrereqCharacter {
  const scores = abilityScores ?? {
    strength: 10, dexterity: 10, constitution: 10,
    intelligence: 10, wisdom: 10, charisma: 10,
  };
  return {
    abilityScores: scores,
    level,
    // L1 wizard creation has no class features beyond the always-on
    // L1 base — but feats with class-feature prereqs (Spellcasting,
    // Fighting Style) typically unlock later (Level 4+ for ability-score
    // improvement, Level 19+ for epic boons), so this rarely fires
    // at the L1 origin step.
    classFeatures: [],
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function CommitBar({
  isChosen, locked, lockReason, commitLabel, onCommit, onDeselect, onContinue, onCancel,
}: {
  isChosen: boolean;
  locked: boolean;
  lockReason?: string;
  commitLabel: string;
  onCommit: () => void;
  onDeselect: () => void;
  onContinue?: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={s.commitBar}>
      {locked && lockReason ? (
        <Text style={s.commitHint}>{lockReason}</Text>
      ) : null}
      {isChosen ? (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onDeselect}>
            <Text style={s.commitSecondaryText}>Deselect</Text>
          </TouchableOpacity>
          {onContinue ? (
            <TouchableOpacity style={s.commitPrimary} onPress={onContinue}>
              <Text style={s.commitPrimaryText}>Continue →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onCancel}>
            <Text style={s.commitSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.commitPrimary, locked && s.commitPrimaryDisabled]}
            onPress={locked ? undefined : onCommit}
            activeOpacity={locked ? 1 : 0.85}
          >
            <Text style={[s.commitPrimaryText, locked && s.commitPrimaryTextDisabled]}>
              {commitLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 12 },
  relaxedNote: {
    fontSize: 11, fontFamily: fonts.body, color: colors.outline,
    fontStyle: 'italic', marginBottom: 12,
  },
  list: { gap: 8 },
  card: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, padding: 12,
  },
  cardSelected: {
    borderColor: colors.primary, backgroundColor: colors.surfaceContainerHigh,
  },
  cardLocked: { opacity: 0.5 },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 38, height: 38, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1,
    borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxSelected: { backgroundColor: colors.primaryContainer + '4d', borderColor: colors.primary + '40' },
  cardText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  cardName: { fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  cardBlurb: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 16 },
  lockTag: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, color: colors.hpDanger,
  },
  pip: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  // Detail
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.md, marginBottom: 14, paddingVertical: 4, alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  detailIcon: {
    width: 56, height: 56, borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '4d', borderWidth: 1,
    borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailTitleWrap: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, lineHeight: 26, marginBottom: 4,
  },
  detailSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  prereqBlock: { marginTop: 14 },
  prereqLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, marginBottom: 4,
  },
  prereqValue: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },
  prereqValueLocked: { color: colors.hpDanger },
  prereqWarn: { fontSize: 11, fontFamily: fonts.body, color: colors.hpDanger, marginTop: 4 },
  detailDesc: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginTop: 14 },
  benefits: { marginTop: 14 },
  sectionLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, marginBottom: 6,
  },
  benefitItem: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, lineHeight: 18, marginBottom: 4 },
  // Commit bar
  commitBar: { marginTop: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  commitHint: {
    fontSize: 10, fontFamily: fonts.label, textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.hpDanger, textAlign: 'center', marginBottom: 8,
  },
  commitRow: { flexDirection: 'row', gap: 8 },
  commitSecondary: {
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  commitSecondaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  commitPrimary: {
    flex: 1, paddingVertical: 14, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  commitPrimaryDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitPrimaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitPrimaryTextDisabled: { color: colors.outline },
});
