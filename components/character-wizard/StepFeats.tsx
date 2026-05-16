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

// Are the player-driven grants on a feat fully resolved? Used to gate
// the commit button — players can't pick Skilled without first
// choosing their three skills. Returns true for feats with no grants.
function grantsSatisfied(
  feat: FeatResult,
  picks: { skills?: string[] } | undefined,
): boolean {
  const skillGrant = feat.grants?.skills;
  if (skillGrant) {
    const picked = picks?.skills ?? [];
    if (picked.length < skillGrant.count) return false;
  }
  return true;
}

// Canonical 5e skill list — fallback when a feat grants `skills.from: 'any'`
// (e.g. Skilled). Mirrors the homebrew background form's ALL_SKILLS so
// the chip-pickers behave identically.
const ALL_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

export function StepFeats({ onPreviewChange, onAdvance }: Props) {
  const {
    srdVersion, chosenFeats, featPicks, abilityScores, startingLevel,
    chosenSkills, speciesKey, backgroundKey, backgroundSkillReplacements,
    setChosenFeats, setFeatPicks, campaignId, selectedPackIds, campaignRules,
  } = useCharacterDraftStore(
    useShallow((s) => ({
      srdVersion: s.srdVersion,
      chosenFeats: s.chosenFeats,
      featPicks: s.featPicks,
      abilityScores: s.abilityScores,
      startingLevel: s.startingLevel,
      chosenSkills: s.chosenSkills,
      speciesKey: s.speciesKey,
      backgroundKey: s.backgroundKey,
      backgroundSkillReplacements: s.backgroundSkillReplacements,
      setChosenFeats: s.setChosenFeats,
      setFeatPicks: s.setFeatPicks,
      campaignId: s.campaignId,
      selectedPackIds: s.selectedPackIds,
      campaignRules: s.campaignRules,
    }))
  );

  const [list, setList] = useState<FeatResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  // Background's skill grants — used by the grant-picker to mark
  // already-proficient skills as disabled when picking Skilled etc.
  // Fetched separately from the feats catalog so the preview-detail
  // render doesn't depend on a sheet-wide bg context (StepFeats is
  // standalone-friendly).
  const [bgSkillProfs, setBgSkillProfs] = useState<string[]>([]);
  // Species-trait skill grants — Owlin's Silent Feathers → Stealth,
  // Wood Elf's Keen Senses → Perception, etc. Fixed grants only
  // (count === from.length); player-pick traits aren't surfaced here.
  const [speciesSkillGrants, setSpeciesSkillGrants] = useState<string[]>([]);
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
        // L1 picker prefers origin-category feats per the 2024 SRD —
        // every PC gets one at first level. But homebrew packs and
        // 2014-style imports often don't tag entries as `origin`
        // (5e.tools' /feat data is mostly 2014-era General feats),
        // so when no origin feats are available we fall back to the
        // full catalog. The prereq checker still hides feats whose
        // prereqs the L1 character can't meet (e.g. "Level 4+",
        // "Spellcasting feature"); fighting-style and epic-boon
        // feats stay visible but the prereq check locks them out
        // for non-applicable characters.
        const origin = all.filter((f) => f.category === 'origin');
        setList(origin.length > 0 ? origin : all);
      })
      .finally(() => setLoading(false));
  }, [srdVersion, campaignId, packIdsKey]);

  // Pull the background's structured skill list so the grant-picker
  // knows what the character already has from background. Skipped when
  // the player hasn't picked a background yet (the wizard normally
  // gates Feats behind Background but campaign re-entries can land
  // here without one).
  useEffect(() => {
    if (!backgroundKey) {
      setBgSkillProfs([]);
      return;
    }
    const includeHomebrew = !!campaignId || selectedPackIds.length > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'background',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && selectedPackIds.length > 0 ? selectedPackIds : undefined,
    }).then((r) => {
      const bg = (r as Array<{ key: string; skillProficiencies?: string[] }>)
        .find((b) => b.key === backgroundKey);
      setBgSkillProfs(bg?.skillProficiencies ?? []);
    });
  }, [backgroundKey, srdVersion, campaignId, packIdsKey]);

  // Same shape for the picked species — pull its traits and collect
  // any fixed-grant skill proficiencies (Owlin → Stealth, etc.).
  useEffect(() => {
    if (!speciesKey) {
      setSpeciesSkillGrants([]);
      return;
    }
    const includeHomebrew = !!campaignId || selectedPackIds.length > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    type TraitGrants = { skills?: { count: number; from: string[] } };
    type TraitShape = { name: string; grants?: TraitGrants };
    type SpeciesShape = { key: string; traits?: TraitShape[] };
    ContentResolver.search({
      type: 'species',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && selectedPackIds.length > 0 ? selectedPackIds : undefined,
    }).then((r) => {
      const sp = (r as SpeciesShape[]).find((x) => x.key === speciesKey);
      const grants: string[] = [];
      for (const t of sp?.traits ?? []) {
        const sg = t.grants?.skills;
        if (!sg) continue;
        // Fixed grants only — same gate the wizard finish flow uses.
        if (sg.from.length === sg.count) {
          for (const sk of sg.from) grants.push(sk);
        }
      }
      setSpeciesSkillGrants(grants);
    });
  }, [speciesKey, srdVersion, campaignId, packIdsKey]);

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

        {/* Player-driven grants. Skilled (and similar) need the player
            to pick N skills before the feat can be committed. */}
        {preview.grants?.skills ? (() => {
          // Capture into a non-nullable local so TS can narrow inside
          // the inner closures (togglePick) — the outer `if (preview)`
          // block doesn't propagate through the IIFE.
          const previewFeat = preview;
          const grant = previewFeat.grants!.skills!;
          const picksForFeat = featPicks[previewFeat.key]?.skills ?? [];
          const target = grant.count;
          const allOptions = grant.from === 'any' ? ALL_SKILLS : grant.from;
          // Skills the character will already have at creation from
          // class + (background after replacement merges) + other
          // feats' picks. Per SRD: "If you gain a skill proficiency
          // you already have, you can choose a different one." Hidden
          // dupes would silently waste a Skilled pick, so we mark
          // them disabled with a strikethrough subtitle.
          //
          // Mirror the wizard finish flow's merge: chosen class skills
          // + bg skills with replacement substitutions + other feats'
          // picks. Exclude THIS feat's picks so deselecting one
          // doesn't immediately re-disable it.
          const existingProfs = new Set<string>();
          for (const sk of chosenSkills) existingProfs.add(sk.toLowerCase());
          for (const sk of bgSkillProfs) {
            const replacement = backgroundSkillReplacements[sk.toLowerCase()];
            existingProfs.add((replacement ?? sk).toLowerCase());
          }
          // Species-trait grants (Owlin's Silent Feathers → Stealth, etc.).
          for (const sk of speciesSkillGrants) existingProfs.add(sk.toLowerCase());
          for (const [otherFeatKey, picks] of Object.entries(featPicks)) {
            if (otherFeatKey === previewFeat.key) continue;
            for (const sk of (picks.skills ?? [])) existingProfs.add(sk.toLowerCase());
          }
          function togglePick(skill: string) {
            const has = picksForFeat.includes(skill);
            const next = has
              ? picksForFeat.filter((s) => s !== skill)
              : (picksForFeat.length < target ? [...picksForFeat, skill] : picksForFeat);
            setFeatPicks({ ...featPicks, [previewFeat.key]: { ...featPicks[previewFeat.key], skills: next } });
          }
          return (
            <View style={s.benefits}>
              <Text style={s.sectionLabel}>{`PICK ${target} SKILL${target === 1 ? '' : 'S'}`}</Text>
              <Text style={[s.benefitItem, { marginBottom: 8 }]}>
                {`${picksForFeat.length} of ${target} chosen.`}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {allOptions.map((skill) => {
                  const picked = picksForFeat.includes(skill);
                  const isExisting = existingProfs.has(skill.toLowerCase());
                  const capped = picksForFeat.length >= target && !picked;
                  const disabled = isExisting || capped;
                  return (
                    <View key={skill} style={{ alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => togglePick(skill)}
                        disabled={disabled}
                        style={[
                          s.skillChip,
                          picked && s.skillChipPicked,
                          isExisting && s.skillChipExisting,
                          capped && !isExisting && s.skillChipDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            s.skillChipText,
                            picked && s.skillChipTextPicked,
                            isExisting && s.skillChipTextExisting,
                          ]}
                        >
                          {skill}
                        </Text>
                      </TouchableOpacity>
                      {isExisting ? (
                        <Text style={s.skillChipExistingHint}>Already proficient</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })() : null}

        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          locked={locked || !grantsSatisfied(preview, featPicks[preview.key])}
          lockReason={
            locked && !check.ok
              ? check.reason
              : !grantsSatisfied(preview, featPicks[preview.key])
                ? `Pick ${preview.grants?.skills?.count ?? 0} skill(s) above before committing.`
                : undefined
          }
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
        {list.length > 0
          ? `Origin feats represent the unique edge your character brings to the adventuring life. ${list.length} available.`
          : 'No feats are available from your current content packs. Continue without picking one — you can add feats later from the character sheet.'}
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

      {/* Empty-state skip. The wizard parent's isStepComplete gate
          requires chosenFeats.length > 0, which would soft-lock a
          player whose pack ships no feats. Tapping skip records a
          sentinel pick (the empty array stays empty; we route past
          the gate by calling onAdvance directly) so they can finish
          creation. */}
      {list.length === 0 ? (
        <TouchableOpacity
          style={s.skipBtn}
          onPress={() => onAdvance?.()}
          activeOpacity={0.85}
        >
          <Text style={s.skipBtnText}>Skip — no feats available</Text>
        </TouchableOpacity>
      ) : null}
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
  skipBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  skipBtnText: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
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
  // Skill chip picker — mirrors StepClass's pill styling so the player
  // sees the same affordance both places.
  skillChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  skillChipPicked: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillChipDisabled: { opacity: 0.35 },
  // "Already proficient" — distinct from capped-disabled so the player
  // can tell which chips are off-limits because they'd duplicate an
  // existing prof. Same treatment as the character sheet's picker.
  skillChipExisting: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    opacity: 0.5,
  },
  skillChipText: { fontSize: 12, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  skillChipTextPicked: { color: colors.onPrimary },
  skillChipTextExisting: {
    color: colors.outline,
    textDecorationLine: 'line-through',
  },
  skillChipExistingHint: {
    fontSize: 9, fontFamily: fonts.label,
    color: colors.outline,
    marginTop: 2, letterSpacing: 0.3,
  },
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
