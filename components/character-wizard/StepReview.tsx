import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors } from '@vaultstone/ui';
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
  const profBonus = 2; // level 1

  const allSkillProfs = [
    ...(bg?.skillProficiencies ?? []),
    ...draft.chosenSkills,
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Review & Finalize</Text>

      <View style={styles.nameSection}>
        <Text style={styles.sectionLabel}>Character Name</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="Enter a name..."
          placeholderTextColor={colors.textSecondary}
          value={draft.characterName}
          onChangeText={setCharacterName}
          maxLength={60}
          autoFocus
        />
      </View>

      <Section title="Identity">
        <Row label="Ruleset" value={draft.srdVersion === 'SRD_2.0' ? 'D&D 5e 2024 (SRD 2.0)' : 'D&D 5e 2014 (SRD 5.1)'} />
        <Row label="Species" value={species?.name ?? draft.speciesKey ?? '—'} />
        <Row label="Class" value={cls?.name ?? draft.classKey ?? '—'} />
        <Row label="Background" value={bg?.name ?? draft.backgroundKey ?? '—'} />
      </Section>

      {scores && (
        <Section title="Ability Scores">
          <View style={styles.scoresGrid}>
            {ABILITY_KEYS.map((ability) => (
              <View key={ability} style={styles.scoreCell}>
                <Text style={styles.scoreMod}>{mod(scores[ability])}</Text>
                <Text style={styles.scoreValue}>{scores[ability]}</Text>
                <Text style={styles.scoreLabel}>{SHORT[ability]}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      <Section title="Combat (Level 1)">
        <Row label="Hit Points" value={hpMax !== null ? `${hpMax} (d${hitDie} + ${conMod >= 0 ? '+' : ''}${conMod} CON)` : '—'} />
        <Row label="Proficiency Bonus" value={`+${profBonus}`} />
        {species && <Row label="Speed" value={`${species.speed} ft.`} />}
        {cls && <Row label="Saving Throws" value={cls.savingThrows.join(', ')} />}
      </Section>

      {allSkillProfs.length > 0 && (
        <Section title="Skill Proficiencies">
          <Text style={styles.skillList}>{allSkillProfs.join(' · ')}</Text>
        </Section>
      )}

      <Text style={styles.attribution}>{ATTRIBUTION}</Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
  nameSection: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  nameInput: {
    fontSize: 18, fontWeight: '600', color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  section: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: colors.textSecondary },
  rowValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },
  scoresGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreCell: { alignItems: 'center', flex: 1 },
  scoreMod: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  scoreValue: { fontSize: 20, fontWeight: '700', color: colors.brand },
  scoreLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  skillList: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  attribution: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', marginTop: 8, lineHeight: 16,
  },
});
