import { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCharacterDraftStore, useAuthStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { createCharacter } from '@vaultstone/api';
import { colors } from '@vaultstone/ui';
import { StepRuleset } from '../../components/character-wizard/StepRuleset';
import { StepSpecies } from '../../components/character-wizard/StepSpecies';
import { StepClass } from '../../components/character-wizard/StepClass';
import { StepBackground } from '../../components/character-wizard/StepBackground';
import { StepAbilityScores } from '../../components/character-wizard/StepAbilityScores';
import { StepReview } from '../../components/character-wizard/StepReview';
import type { Dnd5eStats, Dnd5eResources, ClassResult, BackgroundResult } from '@vaultstone/types';
import { ContentResolver } from '@vaultstone/content';

const STEPS = [
  { key: 'ruleset', label: 'Ruleset' },
  { key: 'species', label: 'Species' },
  { key: 'class', label: 'Class' },
  { key: 'background', label: 'Background' },
  { key: 'scores', label: 'Ability Scores' },
  { key: 'review', label: 'Review' },
];

export default function NewCharacterScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const draft = useCharacterDraftStore(
    useShallow((s) => ({
      speciesKey: s.speciesKey,
      classKey: s.classKey,
      chosenSkills: s.chosenSkills,
      backgroundKey: s.backgroundKey,
      abilityScores: s.abilityScores,
      characterName: s.characterName,
      srdVersion: s.srdVersion,
      system: s.system,
      campaignId: s.campaignId,
    }))
  );
  const resetDraft = useCharacterDraftStore((s) => s.resetDraft);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function isStepComplete(index: number): boolean {
    switch (index) {
      case 0: return true;
      case 1: return draft.speciesKey !== null;
      case 2: return draft.classKey !== null;
      case 3: return draft.backgroundKey !== null;
      case 4: return draft.abilityScores !== null;
      case 5: return draft.characterName.trim().length > 0;
      default: return false;
    }
  }

  function canAdvance() {
    return isStepComplete(step);
  }

  async function handleFinish() {
    if (!user || !draft.abilityScores || !draft.speciesKey || !draft.classKey || !draft.backgroundKey) return;
    setSaving(true);
    setSaveError('');

    try {
      // Load class + background for proficiencies snapshot
      const [clsResults, bgResults, speciesResults] = await Promise.all([
        ContentResolver.search({ type: 'class', system: 'dnd5e', tiers: ['srd'] }),
        ContentResolver.search({ type: 'background', system: 'dnd5e', tiers: ['srd'] }),
        ContentResolver.search({ type: 'species', system: 'dnd5e', tiers: ['srd'] }),
      ]);
      const cls = (clsResults as ClassResult[]).find((c) => c.key === draft.classKey);
      const bg = (bgResults as BackgroundResult[]).find((b) => b.key === draft.backgroundKey);
      const sp = speciesResults.find((s) => s.key === draft.speciesKey);

      if (!cls || !bg || !sp) {
        setSaveError('Could not load content. Please try again.');
        setSaving(false);
        return;
      }

      const conMod = Math.floor((draft.abilityScores.constitution - 10) / 2);
      const hpMax = cls.hitDie + conMod;

      const base_stats: Dnd5eStats = {
        characterName: draft.characterName.trim(),
        level: 1,
        speciesKey: draft.speciesKey,
        classKey: draft.classKey,
        backgroundKey: draft.backgroundKey,
        srdVersion: draft.srdVersion,
        abilityScores: draft.abilityScores,
        savingThrowProficiencies: cls.savingThrows.map((s) => s.toLowerCase()),
        skillProficiencies: [
          ...bg.skillProficiencies.map((s) => s.toLowerCase()),
          ...draft.chosenSkills.map((s) => s.toLowerCase()),
        ],
        armorProficiencies: cls.armorProficiencies,
        weaponProficiencies: cls.weaponProficiencies,
        toolProficiencies: bg.toolProficiency ? [bg.toolProficiency] : [],
        languages: [],
        hitDie: cls.hitDie,
        spellcastingAbility: cls.spellcastingAbility,
        originFeat: bg.originFeat,
        speed: (sp as any).speed ?? 30,
        hpMax,
      };

      const resources: Dnd5eResources = {
        hpCurrent: hpMax,
        hpTemp: 0,
        hitDiceRemaining: 1,
        inspiration: false,
        deathSaves: { successes: 0, failures: 0 },
        exhaustionLevel: 0,
        spellSlots: null,
      };

      const { data, error } = await createCharacter({
        user_id: user.id,
        campaign_id: draft.campaignId ?? null,
        name: draft.characterName.trim(),
        system: draft.system,
        base_stats: base_stats as unknown as import('@vaultstone/types').Json,
        resources: resources as unknown as import('@vaultstone/types').Json,
      });

      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }

      resetDraft();
      router.replace(`/character/${data.id}`);
    } catch (e) {
      setSaveError('Unexpected error. Please try again.');
      setSaving(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 0 ? router.back() : setStep(step - 1))} style={styles.backBtn}>
          <Text style={styles.backText}>{step === 0 ? 'Cancel' : '← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>{STEPS[step].label}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Step progress */}
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.progressDot,
              i < step && styles.progressDotDone,
              i === step && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Step content */}
      <View style={styles.content}>
        {step === 0 && <StepRuleset />}
        {step === 1 && <StepSpecies />}
        {step === 2 && <StepClass />}
        {step === 3 && <StepBackground />}
        {step === 4 && <StepAbilityScores />}
        {step === 5 && <StepReview />}
      </View>

      {/* Footer nav */}
      <View style={styles.footer}>
        {step === 2 && draft.classKey !== null && draft.chosenSkills.length === 0 && (
          <Text style={styles.footerHint}>↑ Scroll down in the class card to pick your skills</Text>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        <TouchableOpacity
          style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
          disabled={!canAdvance() || saving}
          onPress={isLast ? handleFinish : () => setStep(step + 1)}
        >
          <Text style={styles.nextBtnText}>
            {saving ? 'Saving…' : isLast ? 'Finish' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  backBtn: { width: 70 },
  backText: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  stepTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  progressDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotDone: { backgroundColor: colors.brand + '88' },
  progressDotActive: { backgroundColor: colors.brand, width: 20, borderRadius: 4 },
  content: { flex: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  footerHint: { fontSize: 12, color: colors.hpWarning, textAlign: 'center', marginBottom: 8 },
  saveError: { fontSize: 13, color: colors.hpDanger, textAlign: 'center', marginBottom: 8 },
  nextBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
