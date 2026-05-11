import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import { WizardSigil } from './WizardSigil';
import type { BackgroundResult } from '@vaultstone/types';

const BG_GLYPH: Record<string, string> = {
  acolyte: 'sun', artisan: 'hammer', charlatan: 'mask', criminal: 'dagger',
  entertainer: 'lute', farmer: 'leaf', guard: 'shield', hermit: 'moon',
  noble: 'crown', sage: 'book', sailor: 'wave', soldier: 'sword',
  urchin: 'mask', wayfarer: 'compass',
};

const ABILITY_SHORT: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

interface Props {
  onPreviewChange?: (inPreview: boolean) => void;
  onAdvance?: () => void;
}

// Canonical 5e skill list. Mirrored from the imported-content
// classes transform (ALL_SKILLS) so the swap-replacement picker has
// the full universe to choose from. Lower-cased entries match the
// shape stored on draft.chosenSkills + the merged skillProficiencies.
const ALL_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

export function StepBackground({ onPreviewChange, onAdvance }: Props) {
  const {
    srdVersion, backgroundKey, setBackground,
    campaignId, selectedPackIds,
    chosenSkills,
    backgroundSkillReplacements, setBackgroundSkillReplacements,
    campaignRules,
  } = useCharacterDraftStore(
    useShallow((s) => ({
      srdVersion: s.srdVersion,
      backgroundKey: s.backgroundKey,
      setBackground: s.setBackground,
      campaignId: s.campaignId,
      selectedPackIds: s.selectedPackIds,
      chosenSkills: s.chosenSkills,
      backgroundSkillReplacements: s.backgroundSkillReplacements,
      setBackgroundSkillReplacements: s.setBackgroundSkillReplacements,
      campaignRules: s.campaignRules,
    }))
  );
  const customizeOrigin = (campaignRules.customize_origin as boolean | undefined) !== false;
  const is2024 = srdVersion === 'SRD_2.0';

  const [list, setList] = useState<BackgroundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const packIdsKey = selectedPackIds.join(',');

  useEffect(() => {
    const includeHomebrew = !!campaignId || selectedPackIds.length > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'background',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && selectedPackIds.length > 0 ? selectedPackIds : undefined,
    })
      .then((r) => setList(r as BackgroundResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion, campaignId, packIdsKey]);

  useEffect(() => { onPreviewChange?.(!!previewKey); }, [previewKey]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator color={colors.primary} /></View>;
  }

  const preview = previewKey ? list.find((b) => b.key === previewKey) : null;

  if (preview) {
    const isChosen = backgroundKey === preview.key;
    const glyph = BG_GLYPH[preview.key] ?? 'book';
    const abilityOpts = preview.abilityScoreOptions.map((a) => ABILITY_SHORT[a] ?? a.toUpperCase()).join(', ');

    // Skill collision detection. The SRD says: "If a feature lets
    // you gain a skill proficiency you already have, you can choose
    // a different skill." So when a background grants a skill the
    // class already chose, surface a chip-row picker for that
    // collision letting the player pick a replacement from any
    // skill the character doesn't already have. Continue is gated
    // until every collision is resolved.
    const chosenSkillsLc = new Set(chosenSkills.map((c) => c.toLowerCase()));
    const conflicts = preview.skillProficiencies.filter((sk) =>
      chosenSkillsLc.has(sk.toLowerCase()),
    );
    // Skills the character will have *after* the background applies,
    // accounting for any swap replacements already chosen. Used to
    // filter out the replacement picker's options (you can't replace
    // a conflict with a skill you also already have).
    const skillsAfterMerge = new Set<string>(
      chosenSkills.map((c) => c.toLowerCase()),
    );
    for (const sk of preview.skillProficiencies) {
      const orig = sk.toLowerCase();
      const replacement = backgroundSkillReplacements[orig];
      if (replacement) skillsAfterMerge.add(replacement.toLowerCase());
      else if (!chosenSkillsLc.has(orig)) skillsAfterMerge.add(orig);
    }
    const allConflictsResolved = conflicts.every(
      (sk) => !!backgroundSkillReplacements[sk.toLowerCase()],
    );

    function setReplacement(originalSkill: string, replacement: string) {
      const next = { ...backgroundSkillReplacements };
      next[originalSkill.toLowerCase()] = replacement.toLowerCase();
      setBackgroundSkillReplacements(next);
    }

    return (
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backLink} onPress={() => setPreviewKey(null)}>
          <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
          <Text style={s.backLinkText}>All Options</Text>
        </TouchableOpacity>

        {/* Header — uses gm accent for background */}
        <View style={s.detailHeader}>
          <View style={s.detailIcon}>
            <WizardSigil name={glyph} size={36} color={colors.gm} />
          </View>
          <View style={s.detailTitleWrap}>
            <Text style={s.detailTitle}>{preview.name}</Text>
            {preview.description ? (
              <Text style={s.detailSubtitle} numberOfLines={2}>{preview.description}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.detailRows}>
          <DetailRow label="Skills" value={preview.skillProficiencies.join(', ')} />
          {preview.toolProficiency && <DetailRow label="Tool" value={preview.toolProficiency} />}
          {(() => {
            // ASI row resolves by edition + CYO:
            //   2024 background: ships abilityScoreOptions, +2/+1 from
            //     those 3 (CYO on broadens to any 6 — assignment on AS step)
            //   5.1 background + CYO on: Tasha's lets the player take
            //     +2/+1 from any 6 abilities (assignment on AS step)
            //   5.1 background + CYO off: no background-granted ASI;
            //     species handles it
            if (is2024 && preview.abilityScoreOptions.length > 0) {
              const note = customizeOrigin
                ? ' (any abilities with Custom Origin — assigned on Ability Scores step)'
                : ' (assigned on Ability Scores step)';
              return (
                <DetailRow
                  label="Ability Scores"
                  value={`+2/+1 from ${abilityOpts}${note}`}
                />
              );
            }
            if (!is2024 && customizeOrigin) {
              return (
                <DetailRow
                  label="Ability Scores"
                  value="+2/+1 from any abilities (Custom Origin — assigned on Ability Scores step)"
                />
              );
            }
            return null;
          })()}
          {preview.originFeat ? (
            <DetailRowAccent label="Origin Feat" value={preview.originFeat} />
          ) : null}
        </View>

        {conflicts.length > 0 ? (
          <View style={s.conflictWrap}>
            <Text style={s.conflictTitle}>Skill conflict</Text>
            <Text style={s.conflictBody}>
              {conflicts.length === 1
                ? `You already have ${conflicts[0]} from your class. Pick a different skill to gain instead.`
                : `You already have ${conflicts.join(', ')} from your class. Pick different skills to gain instead.`}
            </Text>
            {conflicts.map((conflict) => {
              const conflictLc = conflict.toLowerCase();
              const currentReplacement = backgroundSkillReplacements[conflictLc];
              const options = ALL_SKILLS.filter((sk) => {
                const lc = sk.toLowerCase();
                if (lc === conflictLc) return false;
                if (lc === currentReplacement) return true;
                return !skillsAfterMerge.has(lc);
              });
              return (
                <View key={conflict} style={s.conflictRow}>
                  <Text style={s.conflictRowLabel}>Replace {conflict} with:</Text>
                  <View style={s.conflictChips}>
                    {options.map((sk) => {
                      const selected = currentReplacement === sk.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={sk}
                          style={[s.conflictChip, selected && s.conflictChipSelected]}
                          onPress={() => setReplacement(conflict, sk)}
                          activeOpacity={0.85}
                        >
                          <Text style={[s.conflictChipText, selected && s.conflictChipTextSelected]}>
                            {sk}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          disabled={!allConflictsResolved}
          disabledLabel={!allConflictsResolved ? 'Resolve skill conflict to continue' : undefined}
          commitLabel={`Choose ${preview.name}`}
          onCommit={() => {
            if (!allConflictsResolved) return;
            setBackground(preview.key);
            onAdvance?.();
          }}
          onDeselect={() => { setBackground(null as any); setPreviewKey(null); }}
          onContinue={isChosen && allConflictsResolved ? onAdvance : undefined}
          onCancel={() => setPreviewKey(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose a background</Text>
      <Text style={s.guidance}>Your life before adventure — giving you skills, a tool, and a starting feat. {list.length} available.</Text>
      <View style={s.list}>
        {list.map((b) => {
          const selected = backgroundKey === b.key;
          const glyph = BG_GLYPH[b.key] ?? 'book';
          return (
            <TouchableOpacity
              key={b.key}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => setPreviewKey(b.key)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <View style={s.cardInner}>
                <View style={[s.iconBox, selected && s.iconBoxSelected]}>
                  <WizardSigil name={glyph} size={32} color={selected ? colors.gm : colors.onSurfaceVariant} />
                </View>
                <View style={s.cardText}>
                  <View style={s.nameRow}>
                    <Text style={s.cardName}>{b.name}</Text>
                    {selected && <SelectedPip />}
                  </View>
                  <Text style={s.cardBlurb} numberOfLines={2}>{b.description ?? b.skillProficiencies.join(', ')}</Text>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={s.detailRowValue}>{value}</Text>
    </View>
  );
}

function DetailRowAccent({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={[s.detailRowValue, { color: colors.gm, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

function CommitBar({
  isChosen, commitLabel, disabled, disabledLabel,
  onCommit, onDeselect, onContinue, onCancel,
}: {
  isChosen: boolean;
  commitLabel: string;
  disabled?: boolean;
  disabledLabel?: string;
  onCommit: () => void;
  onDeselect: () => void;
  onContinue?: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={s.commitBar}>
      {disabled && disabledLabel ? (
        <Text style={s.commitHint}>{disabledLabel}</Text>
      ) : null}
      {isChosen ? (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onDeselect}>
            <Text style={s.commitSecondaryText}>Deselect</Text>
          </TouchableOpacity>
          {onContinue && (
            <TouchableOpacity style={[s.commitPrimary, { backgroundColor: colors.gm }]} onPress={onContinue}>
              <Text style={[s.commitPrimaryText, { color: colors.onGm }]}>Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onCancel}>
            <Text style={s.commitSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.commitPrimary,
              { backgroundColor: disabled ? colors.surfaceContainerHighest : colors.gm },
            ]}
            onPress={disabled ? undefined : onCommit}
            activeOpacity={disabled ? 1 : 0.85}
          >
            <Text style={[
              s.commitPrimaryText,
              { color: disabled ? colors.outline : colors.onGm },
            ]}>{commitLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SelectedPip() {
  return (
    <View style={s.pip}>
      <MaterialCommunityIcons name="check" size={10} color={colors.onPrimary} />
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
  guidance: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 16 },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, padding: 14, overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.gm, backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.gm, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  selectedGlow: {
    position: 'absolute', top: 0, right: 0, width: 80, height: 80,
    borderRadius: 40, backgroundColor: colors.gmContainer, opacity: 0.2,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1,
    borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxSelected: { backgroundColor: `${colors.gmContainer}99`, borderColor: `${colors.gm}33` },
  cardText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardName: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  cardBlurb: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  pip: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.gm, alignItems: 'center', justifyContent: 'center' },
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
    width: 60, height: 60, borderRadius: radius.lg,
    backgroundColor: `${colors.gmContainer}99`, borderWidth: 1,
    borderColor: `${colors.gm}33`, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailTitleWrap: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, lineHeight: 26, marginBottom: 4,
  },
  detailSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  detailRows: { marginTop: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 3 },
  detailRowLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, width: 100,
  },
  detailRowValue: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface, flex: 1 },
  // Conflict block — visually separated from the read-only detail rows
  // because it requires player action.
  conflictWrap: {
    marginTop: 18,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.hpWarning}55`,
    backgroundColor: `${colors.hpWarning}11`,
    gap: 8,
  },
  conflictTitle: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: colors.hpWarning,
  },
  conflictBody: {
    fontSize: 12, fontFamily: fonts.body, lineHeight: 17,
    color: colors.onSurface,
  },
  conflictRow: { gap: 6, marginTop: 4 },
  conflictRowLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, color: colors.onSurfaceVariant,
  },
  conflictChips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  conflictChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  conflictChipSelected: {
    borderColor: colors.gm,
    backgroundColor: `${colors.gmContainer}55`,
  },
  conflictChipText: {
    fontSize: 12, fontFamily: fonts.body, fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  conflictChipTextSelected: { color: colors.gm },
  commitBar: { marginTop: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  commitHint: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase',
    color: colors.hpWarning, textAlign: 'center', marginBottom: 8,
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
  commitPrimaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
});
