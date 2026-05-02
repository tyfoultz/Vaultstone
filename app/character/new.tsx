import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCharacterDraftStore, useAuthStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { createCharacter, supabase } from '@vaultstone/api';
import { colors, fonts, spacing, radius, ContentWidth } from '@vaultstone/ui';
import { ContentResolver } from '@vaultstone/content';
import { StepRuleset } from '../../components/character-wizard/StepRuleset';
import { StepSpecies } from '../../components/character-wizard/StepSpecies';
import { StepClass } from '../../components/character-wizard/StepClass';
import { StepBackground } from '../../components/character-wizard/StepBackground';
import { StepAbilityScores } from '../../components/character-wizard/StepAbilityScores';
import { StepReview } from '../../components/character-wizard/StepReview';
import { SheetSoFar } from '../../components/character-wizard/SheetSoFar';
import type { Dnd5eStats, Dnd5eResources, Dnd5eSpellSlotLevel, ClassResult, BackgroundResult, SpeciesResult } from '@vaultstone/types';

// SRD 5e full-caster spell slot progression [level → [lvl1, lvl2, ... lvl9]]
const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1:  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2:  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3:  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4:  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5:  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6:  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7:  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8:  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9:  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

function initSpellSlots(level: number): Dnd5eResources['spellSlots'] {
  const row = FULL_CASTER_SLOTS[Math.min(level, 20)] ?? FULL_CASTER_SLOTS[1];
  const make = (max: number): Dnd5eSpellSlotLevel => ({ max, remaining: max });
  return {
    1: make(row[0]), 2: make(row[1]), 3: make(row[2]),
    4: make(row[3]), 5: make(row[4]), 6: make(row[5]),
    7: make(row[6]), 8: make(row[7]), 9: make(row[8]),
  };
}

// Step list when the wizard is launched without a campaign — user picks
// the ruleset themselves at step 0.
const STANDALONE_STEPS = [
  { key: 'ruleset', label: 'Ruleset' },
  { key: 'species', label: 'Species' },
  { key: 'class', label: 'Class' },
  { key: 'background', label: 'Background' },
  { key: 'scores', label: 'Ability Scores' },
  { key: 'review', label: 'Review' },
];

// When launched from inside a campaign the ruleset is locked to the
// campaign's system, so we skip the picker entirely.
const CAMPAIGN_STEPS = [
  { key: 'species', label: 'Species' },
  { key: 'class', label: 'Class' },
  { key: 'background', label: 'Background' },
  { key: 'scores', label: 'Ability Scores' },
  { key: 'review', label: 'Review' },
];

// Translate a campaigns.system id (dnd5e_2014 / dnd5e_2024 / dnd5e legacy
// alias) into the wizard's draft shape (system + srdVersion). The draft's
// `system` is left at the legacy 'dnd5e' alias because SRD content rows
// are keyed under 'dnd5e' uniformly — switching to the explicit edition id
// would break content filtering. The campaign edition is conveyed through
// `srdVersion`, which the content bundles already filter on.
function systemToDraft(systemId: string): { system: string; srdVersion: 'SRD_5.1' | 'SRD_2.0' } {
  if (systemId === 'dnd5e_2014') return { system: 'dnd5e', srdVersion: 'SRD_5.1' };
  // dnd5e_2024 / legacy dnd5e / Custom all fall through to the 2024 SRD.
  return { system: 'dnd5e', srdVersion: 'SRD_2.0' };
}

export default function NewCharacterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ campaignId?: string }>();
  const launchedCampaignId = params.campaignId ?? null;
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
  const setDraftCampaignId = useCharacterDraftStore((s) => s.setCampaignId);
  const setDraftRuleset = useCharacterDraftStore((s) => s.setRuleset);
  const setDraftRulesetMode = useCharacterDraftStore((s) => s.setRulesetMode);
  // Subscribed separately so the Next-button gate re-renders when the
  // user picks a path on the fork screen.
  const rulesetMode = useCharacterDraftStore((s) => s.rulesetMode);

  // Bootstrap from the campaign route parameter. We fetch the campaign's
  // system server-side, set the draft state, and pin the wizard to the
  // campaign-step list so the user starts at Species rather than picking
  // a ruleset they can't change. The bootstrap effect runs once per
  // mount (the campaignId param doesn't change mid-wizard).
  const [bootstrapping, setBootstrapping] = useState(!!launchedCampaignId);
  const [campaignBootstrapError, setCampaignBootstrapError] = useState('');
  useEffect(() => {
    if (!launchedCampaignId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, system')
        .eq('id', launchedCampaignId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        setCampaignBootstrapError('Could not load campaign context.');
        setBootstrapping(false);
        return;
      }
      const { system, srdVersion } = systemToDraft(data.system);
      setDraftCampaignId(launchedCampaignId);
      setDraftRuleset(system, srdVersion);
      // The user opened the wizard via a campaign route, so they've
      // implicitly committed to campaign mode — record it in the draft
      // so the Next-button gate doesn't see a null rulesetMode and lock
      // them out. (For campaign-launched flows the ruleset step is
      // skipped entirely, but the gate still reads rulesetMode for
      // step 0 in standalone-launched flows.)
      setDraftRulesetMode('campaign');
      setBootstrapping(false);
    })();
    return () => { cancelled = true; };
  }, [launchedCampaignId, setDraftCampaignId, setDraftRuleset, setDraftRulesetMode]);

  // Active step list and current step, swapped based on launch context.
  const STEPS = launchedCampaignId ? CAMPAIGN_STEPS : STANDALONE_STEPS;

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
    const key = STEPS[index]?.key;
    switch (key) {
      // Ruleset is complete once the user has committed AND, if they
      // chose campaign mode, actually picked a campaign. Without the
      // campaign-id check, a user could fork to "Link a campaign", not
      // pick one, and still advance to Species — losing the homebrew
      // and ruleset scoping the campaign would have provided.
      // While on the fork screen (rulesetMode === null) Next is
      // disabled so they can't silently inherit the default.
      case 'ruleset':
        if (rulesetMode === null) return false;
        if (rulesetMode === 'campaign' && !draft.campaignId) return false;
        return true;
      case 'species':    return draft.speciesKey !== null;
      case 'class':      return draft.classKey !== null && (classSkillCount === 0 || draft.chosenSkills.length >= classSkillCount);
      case 'background': return draft.backgroundKey !== null;
      case 'scores':     return draft.abilityScores !== null;
      case 'review':     return (draft.characterName ?? '').trim().length > 0;
      default:           return false;
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
        spellSlots: cls.spellcasting ? initSpellSlots(1) : null,
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
  const activeKey = STEPS[step]?.key;

  // Class skills hint: class chosen but skills not yet all picked
  const showSkillHint = activeKey === 'class' && draft.classKey !== null && classSkillCount > 0 && draft.chosenSkills.length < classSkillCount;

  // SheetSoFar visible between steps 1-4, not when in a detail preview, not on last step
  // Sheet summary visible on species → scores, hidden on the ruleset
  // picker (when present) and the final review step. Key-based so it's
  // correct under both step-list orderings.
  const showSheetSoFar =
    !inPreview &&
    activeKey != null &&
    activeKey !== 'ruleset' &&
    activeKey !== 'review';

  // While we're loading the campaign context, show a minimal placeholder.
  // The wizard mounts the steps as soon as the system + campaignId are
  // pinned in the draft so the picker queries can fire with the right
  // filters from the first render.
  if (bootstrapping) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.bootstrapWrap}>
          <Text style={s.bootstrapText}>
            {campaignBootstrapError || 'Loading campaign…'}
          </Text>
          {campaignBootstrapError ? (
            <TouchableOpacity onPress={() => router.back()} style={[s.nextBtn, { marginTop: spacing.md }]}>
              <Text style={s.nextBtnText}>Back</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      {/* Header */}
      <ContentWidth size="reading">
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
      </ContentWidth>

      {/* Constellation progress */}
      <ContentWidth size="reading">
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
      </ContentWidth>

      {/* Step content. Keyed off the active step's `key` so the indices
          line up across the standalone-vs-campaign step lists. The
          ContentWidth wrapper takes the flex:1 so it absorbs the
          remaining vertical space the way the original View did, while
          capping horizontal width so long-form steps (Ruleset, Review)
          don't span the full screen on widescreens. */}
      <ContentWidth size="reading" style={{ flex: 1 }}>
        <View style={s.content}>
          {(() => {
            const key = STEPS[step]?.key;
            // Helper to advance to the step after the current one. Uses the
            // active step list's index so we land on the right next step in
            // either launch mode.
            const advanceTo = (targetKey: string) => {
              const idx = STEPS.findIndex((s) => s.key === targetKey);
              if (idx >= 0) setStep(idx);
              setInPreview(false);
            };
            switch (key) {
              case 'ruleset':
                return <StepRuleset />;
              case 'species':
                return <StepSpecies onPreviewChange={setInPreview} onAdvance={() => advanceTo('class')} />;
              case 'class':
                return <StepClass onPreviewChange={setInPreview} onAdvance={() => advanceTo('background')} />;
              case 'background':
                return <StepBackground onPreviewChange={setInPreview} onAdvance={() => advanceTo('scores')} />;
              case 'scores':
                return <StepAbilityScores />;
              case 'review':
                return <StepReview />;
              default:
                return null;
            }
          })()}
        </View>
      </ContentWidth>

      {/* SheetSoFar summary bar */}
      {showSheetSoFar && (
        <ContentWidth size="reading">
          <SheetSoFar
            speciesName={speciesName}
            className={className}
            classDie={classDie}
            backgroundName={backgroundName}
            highestStat={highestStat}
            onJumpTo={(key) => {
              const idx = STEPS.findIndex((s) => s.key === key);
              if (idx >= 0) setStep(idx);
              setInPreview(false);
            }}
          />
        </ContentWidth>
      )}

      {/* Footer */}
      {!inPreview && (
        <ContentWidth size="reading">
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
        </ContentWidth>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surfaceCanvas },

  bootstrapWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bootstrapText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    fontFamily: fonts.body,
    textAlign: 'center',
  },

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
