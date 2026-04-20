import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useCharacterDraftStore, useAuthStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { createCharacter } from '@vaultstone/api';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import { ContentResolver } from '@vaultstone/content';
import { StepRuleset } from '../../components/character-wizard/StepRuleset';
import { StepSpecies } from '../../components/character-wizard/StepSpecies';
import { StepClass } from '../../components/character-wizard/StepClass';
import { StepBackground } from '../../components/character-wizard/StepBackground';
import { StepAbilityScores } from '../../components/character-wizard/StepAbilityScores';
import { StepReview } from '../../components/character-wizard/StepReview';
import { SheetSoFar } from '../../components/character-wizard/SheetSoFar';
import type { Dnd5eStats, Dnd5eResources, ClassResult, BackgroundResult, SpeciesResult } from '@vaultstone/types';

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
  const [inPreview, setInPreview] = useState(false);

  // Resolved content names for SheetSoFar
  const [speciesName, setSpeciesName] = useState<string | null>(null);
  const [className, setClassName] = useState<string | null>(null);
  const [classDie, setClassDie] = useState<number | null>(null);
  const [classSkillCount, setClassSkillCount] = useState<number>(0);
  const [backgroundName, setBackgroundName] = useState<string | null>(null);

  useEffect(() => {
    if (draft.speciesKey) {
      ContentResolver.search({ type: 'species', system: 'dnd5e', tiers: ['srd'] }).then((r) => {
        const sp = (r as SpeciesResult[]).find((x) => x.key === draft.speciesKey);
        setSpeciesName(sp?.name ?? null);
      });
    } else {
      setSpeciesName(null);
    }
  }, [draft.speciesKey]);

  useEffect(() => {
    if (draft.classKey) {
      ContentResolver.search({ type: 'class', system: 'dnd5e', tiers: ['srd'] }).then((r) => {
        const cls = (r as ClassResult[]).find((x) => x.key === draft.classKey);
        setClassName(cls?.name ?? null);
        setClassDie(cls?.hitDie ?? null);
        setClassSkillCount(cls?.skillChoices?.count ?? 0);
      });
    } else {
      setClassName(null);
      setClassDie(null);
      setClassSkillCount(0);
    }
  }, [draft.classKey]);

  useEffect(() => {
    if (draft.backgroundKey) {
      ContentResolver.search({ type: 'background', system: 'dnd5e', tiers: ['srd'] }).then((r) => {
        const bg = (r as BackgroundResult[]).find((x) => x.key === draft.backgroundKey);
        setBackgroundName(bg?.name ?? null);
      });
    } else {
      setBackgroundName(null);
    }
  }, [draft.backgroundKey]);

  // Highest ability score for SheetSoFar
  const highestStat = draft.abilityScores
    ? (() => {
        const entries = Object.entries(draft.abilityScores) as [string, number][];
        const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
        const SHORT: Record<string, string> = {
          strength: 'STR', dexterity: 'DEX', constitution: 'CON',
          intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
        };
        return { label: SHORT[best[0]] ?? best[0].toUpperCase(), value: best[1] };
      })()
    : null;

  function isStepComplete(index: number): boolean {
    switch (index) {
      case 0: return true;
      case 1: return draft.speciesKey !== null;
      case 2: return draft.classKey !== null && (classSkillCount === 0 || draft.chosenSkills.length >= classSkillCount);
      case 3: return draft.backgroundKey !== null;
      case 4: return draft.abilityScores !== null;
      case 5: return (draft.characterName ?? '').trim().length > 0;
      default: return false;
    }
  }

  function handleBack() {
    if (step === 0) {
      router.back();
    } else {
      setStep(step - 1);
      setInPreview(false);
    }
  }

  async function handleFinish() {
    if (!user || !draft.abilityScores || !draft.speciesKey || !draft.classKey || !draft.backgroundKey) return;
    setSaving(true);
    setSaveError('');

    try {
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
    } catch {
      setSaveError('Unexpected error. Please try again.');
      setSaving(false);
    }
  }

  const isLast = step === STEPS.length - 1;
  const canAdvance = isStepComplete(step);

  // Class skills hint: class chosen but skills not yet all picked
  const showSkillHint = step === 2 && draft.classKey !== null && classSkillCount > 0 && draft.chosenSkills.length < classSkillCount;

  // SheetSoFar visible between steps 1-4, not when in a detail preview, not on last step
  const showSheetSoFar = step >= 1 && step <= 4 && !inPreview;

  return (
    <SafeAreaView style={s.safeArea}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerSide} hitSlop={8}>
          <Text style={s.headerAction}>{step === 0 ? 'Cancel' : '← Back'}</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.stepCounter}>STEP {String(step + 1).padStart(2, '0')}/{String(STEPS.length).padStart(2, '0')}</Text>
          <Text style={s.stepLabel}>{STEPS[step].label}</Text>
        </View>
        <View style={s.headerSide} />
      </View>

      {/* Constellation progress */}
      <View style={s.constellation}>
        {STEPS.map((st, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={st.key} style={s.constellationItem}>
              {i > 0 && (
                <View style={[s.constellationLine, (done || active) && s.constellationLineActive]} />
              )}
              <View style={[s.constellationNode, done && s.constellationNodeDone, active && s.constellationNodeActive]}>
                {done ? (
                  <Text style={s.constellationCheck}>✓</Text>
                ) : (
                  <Text style={[s.constellationNum, active && s.constellationNumActive]}>{i + 1}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Step content */}
      <View style={s.content}>
        {step === 0 && <StepRuleset />}
        {step === 1 && (
          <StepSpecies
            onPreviewChange={setInPreview}
            onAdvance={() => { setStep(2); setInPreview(false); }}
          />
        )}
        {step === 2 && (
          <StepClass
            onPreviewChange={setInPreview}
            onAdvance={() => { setStep(3); setInPreview(false); }}
          />
        )}
        {step === 3 && (
          <StepBackground
            onPreviewChange={setInPreview}
            onAdvance={() => { setStep(4); setInPreview(false); }}
          />
        )}
        {step === 4 && <StepAbilityScores />}
        {step === 5 && <StepReview />}
      </View>

      {/* SheetSoFar summary bar */}
      {showSheetSoFar && (
        <SheetSoFar
          speciesName={speciesName}
          className={className}
          classDie={classDie}
          backgroundName={backgroundName}
          highestStat={highestStat}
          onJumpTo={(target) => { setStep(target); setInPreview(false); }}
        />
      )}

      {/* Footer */}
      {!inPreview && (
        <View style={s.footer}>
          {showSkillHint && (
            <Text style={s.footerHint}>
              Pick {classSkillCount - draft.chosenSkills.length} more skill{classSkillCount - draft.chosenSkills.length !== 1 ? 's' : ''} to continue
            </Text>
          )}
          {saveError ? <Text style={s.saveError}>{saveError}</Text> : null}
          <TouchableOpacity
            style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
            disabled={!canAdvance || saving}
            onPress={isLast ? handleFinish : () => { setStep(step + 1); setInPreview(false); }}
            activeOpacity={0.85}
          >
            <Text style={[s.nextBtnText, !canAdvance && s.nextBtnTextDisabled]}>
              {saving ? 'Creating…' : isLast ? 'Create Character' : 'Continue →'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surfaceCanvas },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  headerSide: { width: 70 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerAction: {
    fontSize: 13, fontFamily: fonts.label, fontWeight: '600',
    color: colors.primary, letterSpacing: 0.3,
  },
  stepCounter: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 2, textTransform: 'uppercase', color: colors.outline, marginBottom: 2,
  },
  stepLabel: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.3,
  },

  // Constellation progress
  constellation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  constellationItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  constellationLine: {
    width: 24,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  constellationLineActive: {
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  constellationNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  constellationNodeDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryContainer,
  },
  constellationNodeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainer,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 2,
  },
  constellationNum: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    color: colors.outline,
  },
  constellationNumActive: { color: colors.primary },
  constellationCheck: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary,
  },

  content: { flex: 1 },

  // Footer
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: Platform.OS === 'android' ? 20 : 12,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surfaceCanvas,
  },
  footerHint: {
    fontSize: 12, fontFamily: fonts.body,
    color: colors.hpWarning, textAlign: 'center', marginBottom: 8,
  },
  saveError: {
    fontSize: 13, fontFamily: fonts.body,
    color: colors.hpDanger, textAlign: 'center', marginBottom: 8,
  },
  nextBtn: {
    borderRadius: radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  nextBtnDisabled: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  nextBtnText: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.3,
  },
  nextBtnTextDisabled: { color: colors.outline },
});
