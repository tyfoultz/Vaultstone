import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { SpeciesResult, ClassResult, BackgroundResult, Dnd5eAbilityScores } from '@vaultstone/types';

const ATTRIBUTION = 'Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.';

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export function StepReview() {
  const draft = useCharacterDraftStore(
    useShallow((s) => ({
      speciesKey: s.speciesKey,
      classKey: s.classKey,
      backgroundKey: s.backgroundKey,
      srdVersion: s.srdVersion,
      abilityScores: s.abilityScores,
      chosenSkills: s.chosenSkills,
      characterName: s.characterName,
    }))
  );
  const setCharacterName = useCharacterDraftStore((s) => s.setCharacterName);
  const [nameFocused, setNameFocused] = useState(false);

  const [species, setSpecies] = useState<SpeciesResult | null>(null);
  const [cls, setCls] = useState<ClassResult | null>(null);
  const [bg, setBg] = useState<BackgroundResult | null>(null);

  useEffect(() => {
    if (draft.speciesKey) {
      ContentResolver.search({ type: 'species', system: 'dnd5e', tiers: ['srd'] })
        .then((r) => setSpecies((r as SpeciesResult[]).find((s) => s.key === draft.speciesKey) ?? null));
    }
    if (draft.classKey) {
      ContentResolver.search({ type: 'class', system: 'dnd5e', tiers: ['srd'] })
        .then((r) => setCls((r as ClassResult[]).find((c) => c.key === draft.classKey) ?? null));
    }
    if (draft.backgroundKey) {
      ContentResolver.search({ type: 'background', system: 'dnd5e', tiers: ['srd'] })
        .then((r) => setBg((r as BackgroundResult[]).find((b) => b.key === draft.backgroundKey) ?? null));
    }
  }, [draft.speciesKey, draft.classKey, draft.backgroundKey]);

  const scores = draft.abilityScores;
  const conMod = scores ? Math.floor((scores.constitution - 10) / 2) : 0;
  const hitDie = cls?.hitDie ?? 8;
  const hpMax = scores ? hitDie + conMod : null;
  const profBonus = 2;

  const allSkillProfs = [
    ...(bg?.skillProficiencies ?? []),
    ...draft.chosenSkills,
  ];

  const nameFilled = (draft.characterName ?? '').trim().length > 0;
  const nameActive = nameFocused || nameFilled;

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Review & name your character</Text>
      <Text style={s.guidance}>Give your character a name and confirm your choices before creating them.</Text>

      {/* Name input */}
      <View style={[s.nameWrap, nameActive && s.nameWrapActive]}>
        <Text style={[s.nameLabel, nameActive && s.nameLabelActive]}>CHARACTER NAME</Text>
        <TextInput
          style={s.nameInput}
          placeholder="Enter a name…"
          placeholderTextColor={colors.outline}
          value={draft.characterName ?? ''}
          onChangeText={setCharacterName}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          maxLength={60}
          autoFocus
          returnKeyType="done"
        />
      </View>

      {/* Identity section */}
      <ReviewSection title="Identity">
        <RevRow
          label="Ruleset"
          value={draft.srdVersion === 'SRD_2.0' ? 'D&D 5e 2024' : 'D&D 5e 2014'}
          detail={draft.srdVersion === 'SRD_2.0' ? 'SRD 2.0' : 'SRD 5.1'}
        />
        <RevRow label="Species" value={species?.name ?? draft.speciesKey ?? '—'} detail={species ? `${species.size} · ${species.speed} ft` : undefined} />
        <RevRow label="Class" value={cls?.name ?? draft.classKey ?? '—'} detail={cls ? `d${cls.hitDie} hit die` : undefined} />
        <RevRow label="Background" value={bg?.name ?? draft.backgroundKey ?? '—'} detail={bg?.originFeat ? `Feat: ${bg.originFeat}` : undefined} accent={!!bg?.originFeat} />
      </ReviewSection>

      {/* Ability Scores section */}
      {scores && (
        <ReviewSection title="Ability Scores">
          <View style={s.scoresGrid}>
            {ABILITY_KEYS.map((ability) => (
              <View key={ability} style={s.scoreCell}>
                <Text style={s.scoreMod}>{mod(scores[ability])}</Text>
                <Text style={s.scoreValue}>{scores[ability]}</Text>
                <Text style={s.scoreShort}>{SHORT[ability]}</Text>
              </View>
            ))}
          </View>
        </ReviewSection>
      )}

      {/* Combat section */}
      <ReviewSection title="Combat (Level 1)">
        <RevRow
          label="Hit Points"
          value={hpMax !== null ? `${hpMax} HP` : '—'}
          detail={hpMax !== null ? `d${hitDie} + ${conMod >= 0 ? '+' : ''}${conMod} CON` : undefined}
        />
        <RevRow label="Proficiency Bonus" value={`+${profBonus}`} />
        {species && <RevRow label="Speed" value={`${species.speed} ft`} />}
        {cls && <RevRow label="Saving Throws" value={cls.savingThrows.join(', ')} />}
      </ReviewSection>

      {/* Skills section */}
      {allSkillProfs.length > 0 && (
        <ReviewSection title="Skill Proficiencies">
          <View style={s.skillChips}>
            {allSkillProfs.map((skill) => (
              <View key={skill} style={s.skillChip}>
                <Text style={s.skillChipText}>{skill}</Text>
              </View>
            ))}
          </View>
        </ReviewSection>
      )}

      <Text style={s.attribution}>{ATTRIBUTION}</Text>
    </ScrollView>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function RevRow({ label, value, detail, accent }: {
  label: string; value: string; detail?: string; accent?: boolean;
}) {
  return (
    <View style={s.revRow}>
      <Text style={s.revLabel}>{label}</Text>
      <View style={s.revRight}>
        <Text style={[s.revValue, accent && s.revValueAccent]}>{value}</Text>
        {detail ? <Text style={[s.revDetail, accent && s.revDetailAccent]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 20,
  },

  // Name input
  nameWrap: {
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    borderRadius: radius.xl, padding: 14, marginBottom: 16,
    backgroundColor: colors.surfaceContainer,
  },
  nameWrapActive: { borderColor: colors.primary },
  nameLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: colors.outline, marginBottom: 6,
  },
  nameLabelActive: { color: colors.primary },
  nameInput: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, padding: 0,
  },

  // Sections
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: colors.outline, marginBottom: 6, marginLeft: 2,
  },
  sectionBody: {
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },

  // Rev rows
  revRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  revLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, flex: 1 },
  revRight: { alignItems: 'flex-end' },
  revValue: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  revValueAccent: { color: colors.gm },
  revDetail: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, marginTop: 1 },
  revDetailAccent: { color: `${colors.gm}99` },

  // Ability scores grid
  scoresGrid: { flexDirection: 'row', paddingVertical: 8 },
  scoreCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  scoreMod: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, lineHeight: 22,
  },
  scoreValue: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '600',
    color: colors.onSurfaceVariant, lineHeight: 18,
  },
  scoreShort: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline, marginTop: 2,
  },

  // Skill chips
  skillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 },
  skillChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  skillChipText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '600', color: colors.onSurfaceVariant },

  attribution: {
    fontSize: 10, fontFamily: fonts.body, color: colors.outline,
    textAlign: 'center', marginTop: 12, lineHeight: 16,
  },
});
