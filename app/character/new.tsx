import { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useCharacterDraftStore, useAuthStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import {
  createCharacter,
  supabase,
  getCharacterDraft,
  createCharacterDraft,
  updateCharacterDraft,
  deleteCharacterDraft,
  getCampaignCharacterRules,
  resolveRuleValues,
} from '@vaultstone/api';
import {
  BUNDLED_SYSTEMS_BY_ID,
  resolveCreationSteps,
  applyLevelUp,
  classFeaturesAtLevel,
  defaultHpGain,
  unpackClassFeaturesForPick,
  spellSlotsForClassAtLevel,
  computeAsiContext,
  applyAsiContext,
} from '@vaultstone/systems';
import { colors, fonts, spacing, radius, ContentWidth } from '@vaultstone/ui';
import { ContentResolver } from '@vaultstone/content';
import { StepRuleset } from '../../components/character-wizard/StepRuleset';
import { StepRules } from '../../components/character-wizard/StepRules';
import { StepSpecies } from '../../components/character-wizard/StepSpecies';
import { StepClass } from '../../components/character-wizard/StepClass';
import { StepBackground } from '../../components/character-wizard/StepBackground';
import { StepFeats } from '../../components/character-wizard/StepFeats';
import { StepAbilityScores } from '../../components/character-wizard/StepAbilityScores';
import { StepReview } from '../../components/character-wizard/StepReview';
import { SheetSoFar } from '../../components/character-wizard/SheetSoFar';
import { CampaignRulesSummary } from '../../components/character-wizard/CampaignRulesSummary';
import type { Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem, ClassResult, BackgroundResult, SpeciesResult, ItemResult } from '@vaultstone/types';
import { normalizeStartingEquipmentItem } from '@vaultstone/types';
import { itemResultToEquipment } from '../../components/character-sheet/ItemPickerModal';

// initSpellSlots used to ship a duplicate of the leveling library's
// progression-table parser; replaced by `spellSlotsForClassAtLevel`
// from `@vaultstone/systems` so the two paths agree on
// half-caster / Warlock pact-magic / 5.1-vs-5.2 quirks. Non-spellcasters
// resolve to null here so resources.spellSlots stays unset for them.
function initSpellSlots(
  cls: ClassResult,
  level: number,
): Dnd5eResources['spellSlots'] {
  if (!cls.spellcasting) return null;
  return spellSlotsForClassAtLevel(cls, level);
}

// Wizard step list is sourced from the chosen system's
// `creationSteps` schema via `resolveCreationSteps()` — see
// packages/systems/src/resolve-creation-steps.ts. The resolver
// applies two filters: `inCampaign: false` steps drop out when
// launched from a campaign, and `gatedByRule` steps drop out when
// their rule resolves falsy. Standalone wizards fall through to
// each rule's bundled system default.

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

/** Reverse of `systemToDraft` — pick the bundled system definition that
 *  matches the draft's (system, srdVersion). Returns `null` for unknown
 *  combinations (the wizard won't proceed without a system anyway). */
function draftToSystem(
  system: string,
  srdVersion: 'SRD_5.1' | 'SRD_2.0',
) {
  if (system !== 'dnd5e') return null;
  const id = srdVersion === 'SRD_5.1' ? 'dnd5e_2014' : 'dnd5e_2024';
  return BUNDLED_SYSTEMS_BY_ID[id] ?? null;
}

export default function NewCharacterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ campaignId?: string; draftId?: string }>();
  const launchedCampaignId = params.campaignId ?? null;
  const launchedDraftId = params.draftId ?? null;
  const user = useAuthStore((s) => s.user);
  const draft = useCharacterDraftStore(
    useShallow((s) => ({
      speciesKey: s.speciesKey,
      classKey: s.classKey,
      chosenSkills: s.chosenSkills,
      backgroundKey: s.backgroundKey,
      backgroundSkillReplacements: s.backgroundSkillReplacements,
      speciesAbilityChoices: s.speciesAbilityChoices,
      chosenFeats: s.chosenFeats,
      featPicks: s.featPicks,
      abilityScores: s.abilityScores,
      characterName: s.characterName,
      srdVersion: s.srdVersion,
      system: s.system,
      campaignId: s.campaignId,
      selectedPackIds: s.selectedPackIds,
      startingLevel: s.startingLevel,
    }))
  );
  const resetDraft = useCharacterDraftStore((s) => s.resetDraft);
  const hydrateFromSnapshot = useCharacterDraftStore((s) => s.hydrateFromSnapshot);
  const setDraftCampaignId = useCharacterDraftStore((s) => s.setCampaignId);
  const setDraftRuleset = useCharacterDraftStore((s) => s.setRuleset);
  const setDraftRulesetMode = useCharacterDraftStore((s) => s.setRulesetMode);
  // Subscribed separately so the Next-button gate re-renders when the
  // user picks a path on the fork screen.
  const rulesetMode = useCharacterDraftStore((s) => s.rulesetMode);

  // Track which saved draft (if any) the wizard is currently editing.
  // Set when launched with ?draftId=, or when the user taps "Save draft"
  // on a fresh wizard (so subsequent saves update the same row).
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(launchedDraftId);

  // Bootstrap orchestration:
  //   - launched with ?campaignId= → fetch campaign system, set draft
  //   - launched with ?draftId=     → fetch saved draft, hydrate store
  //   - neither                     → reset working store so the user
  //     always sees a fresh fork screen, untouched by prior sessions
  //
  // The bootstrapping flag keeps the rest of the wizard unmounted until
  // the bootstrap completes; otherwise the steps would render briefly
  // with stale state from the persisted store.
  const [bootstrapping, setBootstrapping] = useState(
    !!launchedCampaignId || !!launchedDraftId
  );
  const [bootstrapError, setBootstrapError] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fresh wizard — wipe persisted working state so the user starts
      // at the fork. Drafts they wanted to keep live in character_drafts.
      if (!launchedCampaignId && !launchedDraftId) {
        resetDraft();
        return;
      }

      // Resume a saved draft.
      if (launchedDraftId) {
        const { data, error } = await getCharacterDraft(launchedDraftId);
        if (cancelled) return;
        if (error || !data) {
          setBootstrapError('Could not load draft.');
          setBootstrapping(false);
          return;
        }
        const snapshot = (data.data as Record<string, unknown>) ?? {};
        // Rehydrate over a clean baseline so any field missing from the
        // snapshot lands at its INITIAL_DRAFT default.
        hydrateFromSnapshot(snapshot as never);
        // Restore the active step. The wizard parent keeps its own local
        // `step` state (the store's `currentStep` is just for snapshotting),
        // so without this the user always lands on step 0 even though they
        // saved mid-wizard. Defer with a microtask so STEPS has time to
        // resolve from the hydrated system; clamp anyway against the
        // resolved length below.
        const saved = typeof snapshot.currentStep === 'number' ? snapshot.currentStep : 0;
        setPendingResumeStep(saved);
        setBootstrapping(false);
        return;
      }

      // Launched from a campaign — fetch its system + lock the wizard.
      if (launchedCampaignId) {
        // Reset first so we don't carry stale species/class from a
        // prior session into this campaign-locked flow.
        resetDraft();
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, system')
          .eq('id', launchedCampaignId)
          .single();
        if (cancelled) return;
        if (error || !data) {
          setBootstrapError('Could not load campaign context.');
          setBootstrapping(false);
          return;
        }
        const { system, srdVersion } = systemToDraft(data.system);
        setDraftCampaignId(launchedCampaignId);
        setDraftRuleset(system, srdVersion);
        // Implicit commit to campaign mode (ruleset step is skipped in
        // this flow, but the gate still reads rulesetMode).
        setDraftRulesetMode('campaign');

        // Apply the campaign's character-creation rules. Starting
        // level seeds the new character; ability score method seeds
        // the wizard's default but the player can still override on
        // the StepAbilityScores page (the rule's scope is
        // 'character'). Other rules (multiclassing, feats variant,
        // optional class features, customize origin) apply at the
        // sheet/wizard step level; downstream steps consume them as
        // they get touched in follow-up work.
        const sys = BUNDLED_SYSTEMS_BY_ID[data.system];
        const { data: rulesBag } = await getCampaignCharacterRules(launchedCampaignId);
        if (sys && rulesBag) {
          const resolved = resolveRuleValues(sys.optionalRules, rulesBag);
          // Stash the full resolved set on the draft so wizard
          // steps + the read-only summary can read any rule
          // without re-fetching. Each step decides which keys it
          // cares about.
          useCharacterDraftStore.getState().setCampaignRules(resolved);
          const startingLevel = Number(resolved.starting_level);
          if (Number.isFinite(startingLevel) && startingLevel >= 1 && startingLevel <= 20) {
            useCharacterDraftStore.getState().setStartingLevel(startingLevel);
          }
          const method = String(resolved.ability_score_method);
          if (method === 'standard_array' || method === 'point_buy' || method === 'rolled') {
            // 'rolled' is the system label for 4d6-drop-lowest; the
            // draft store's discriminator uses 'roll_dice' for the
            // same concept (legacy naming). Bridge the two here.
            const draftMethod =
              method === 'rolled' ? 'roll_dice' :
              method === 'point_buy' ? 'point_buy' :
              'standard_array';
            useCharacterDraftStore.getState().setAbilityScoreMethod(draftMethod);
          }
        }

        setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    launchedCampaignId,
    launchedDraftId,
    resetDraft,
    hydrateFromSnapshot,
    setDraftCampaignId,
    setDraftRuleset,
    setDraftRulesetMode,
  ]);

  // Active step list resolved from the chosen system's `creationSteps`
  // schema. The resolver applies inCampaign + gatedByRule filters, so
  // changes to a system's step list (or to which steps are rule-gated)
  // ripple through the wizard without code edits here. The campaign-
  // rules bag is populated during bootstrap for campaign-launched
  // wizards; until bootstrap finishes the bag is empty and gated steps
  // fall through to each rule's bundled system default.
  const draftCampaignRules = useCharacterDraftStore((s) => s.campaignRules);
  const STEPS = useMemo(() => {
    const sys = draftToSystem(draft.system, draft.srdVersion);
    if (!sys) return [];
    return resolveCreationSteps(sys, {
      isCampaign: !!launchedCampaignId,
      campaignRules: draftCampaignRules,
    }).map((s) => ({ key: s.key, label: s.label }));
  }, [launchedCampaignId, draftCampaignRules, draft.system, draft.srdVersion]);

  const [step, setStep] = useState(0);
  // Holds a step the resume flow wants to land on, applied once the
  // STEPS list has resolved from the hydrated system (clamped to the
  // resolved length so a stale value can't index past the end).
  const [pendingResumeStep, setPendingResumeStep] = useState<number | null>(null);
  useEffect(() => {
    if (pendingResumeStep === null || STEPS.length === 0) return;
    const clamped = Math.max(0, Math.min(pendingResumeStep, STEPS.length - 1));
    setStep(clamped);
    setPendingResumeStep(null);
  }, [pendingResumeStep, STEPS.length]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [inPreview, setInPreview] = useState(false);

  // Resolved content names for SheetSoFar
  const [speciesName, setSpeciesName] = useState<string | null>(null);
  const [className, setClassName] = useState<string | null>(null);
  const [classDie, setClassDie] = useState<number | null>(null);
  const [classSkillCount, setClassSkillCount] = useState<number>(0);
  const [backgroundName, setBackgroundName] = useState<string | null>(null);

  // Resolve picked content names for the SheetSoFar bar through the
  // same tiers the picker steps used. SRD-only here renders raw keys
  // ("homebrew_my-pack_class_warden") in the summary the moment a
  // homebrew class/species/background is picked.
  const sheetSoFarPackIdsKey = draft.selectedPackIds.join(',');
  const sheetSoFarTierArgs = useMemo(() => {
    const includeHomebrew = !!draft.campaignId || draft.selectedPackIds.length > 0;
    return {
      system: 'dnd5e' as const,
      srdVersion: draft.srdVersion,
      tiers: (includeHomebrew ? ['srd', 'homebrew'] : ['srd']) as Array<'srd' | 'homebrew'>,
      campaignId: draft.campaignId ?? undefined,
      packIds: !draft.campaignId && draft.selectedPackIds.length > 0 ? draft.selectedPackIds : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.srdVersion, draft.campaignId, sheetSoFarPackIdsKey]);

  useEffect(() => {
    if (draft.speciesKey) {
      ContentResolver.search({ type: 'species', ...sheetSoFarTierArgs }).then((r) => {
        const sp = (r as SpeciesResult[]).find((x) => x.key === draft.speciesKey);
        setSpeciesName(sp?.name ?? null);
      });
    } else {
      setSpeciesName(null);
    }
  }, [draft.speciesKey, sheetSoFarTierArgs]);

  useEffect(() => {
    if (draft.classKey) {
      ContentResolver.search({ type: 'class', ...sheetSoFarTierArgs }).then((r) => {
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
  }, [draft.classKey, sheetSoFarTierArgs]);

  useEffect(() => {
    if (draft.backgroundKey) {
      ContentResolver.search({ type: 'background', ...sheetSoFarTierArgs }).then((r) => {
        const bg = (r as BackgroundResult[]).find((x) => x.key === draft.backgroundKey);
        setBackgroundName(bg?.name ?? null);
      });
    } else {
      setBackgroundName(null);
    }
  }, [draft.backgroundKey, sheetSoFarTierArgs]);

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
      case 'rules':      return true; // Always complete — campaign launch is read-only,
                                       // standalone seeds defaults on mount so the bag is populated.
      case 'species':    return draft.speciesKey !== null;
      case 'class':      return draft.classKey !== null && (classSkillCount === 0 || draft.chosenSkills.length >= classSkillCount);
      case 'background': return draft.backgroundKey !== null;
      case 'feats':      return draft.chosenFeats.length > 0;
      case 'scores':     return draft.abilityScores !== null;
      case 'review':     return (draft.characterName ?? '').trim().length > 0;
      default:           return false;
    }
  }

  function handleBack() {
    if (step === 0) {
      // Cancel from the first step routes back to wherever the user
      // came from — the campaigns list, the campaign they launched
      // from, or a draft list. router.back() on its own no-ops when
      // there's no history (deep links, browser refresh), so fall
      // through to a safe destination so the button is always
      // responsive.
      if (router.canGoBack()) {
        router.back();
      } else if (launchedCampaignId) {
        router.replace(`/campaign/${launchedCampaignId}` as Href);
      } else {
        router.replace('/(drawer)/characters' as Href);
      }
    } else {
      setStep(step - 1);
      setInPreview(false);
    }
  }

  // Save Draft state. Distinct from `saving` (which is for finishing
  // the character) so a save-draft mid-wizard doesn't disable Next.
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState('');

  /**
   * Snapshot the full working draft to a server-side row. First save on a
   * fresh wizard creates a new row; subsequent saves update it in place
   * (tracked via `currentDraftId`). On success we route back to the
   * Characters drawer page where the draft now appears with its badge.
   */
  async function handleSaveDraft() {
    if (!user) return;
    setSavingDraft(true);
    setDraftSaveError('');

    // Pull the entire CharacterDraft (not just the destructured `draft`
    // we use for rendering) so every wizard field round-trips. The
    // wizard parent owns `step` as local state (the store's
    // `currentStep` is just a snapshot field), so use the local value
    // here — otherwise saved drafts always record step 0.
    const snapshot = useCharacterDraftStore.getState();
    const data = {
      currentStep: step,
      system: snapshot.system,
      srdVersion: snapshot.srdVersion,
      rulesetMode: snapshot.rulesetMode,
      speciesKey: snapshot.speciesKey,
      classKey: snapshot.classKey,
      chosenSkills: snapshot.chosenSkills,
      backgroundKey: snapshot.backgroundKey,
      // Feats + per-feat picks (Skilled grants a skill list, etc.).
      // Round-tripping these lets save-draft resume hit StepFeats
      // already populated.
      chosenFeats: snapshot.chosenFeats,
      featPicks: snapshot.featPicks,
      abilityScoreMethod: snapshot.abilityScoreMethod,
      abilityScores: snapshot.abilityScores,
      characterName: snapshot.characterName,
      campaignId: snapshot.campaignId,
    };
    // Display name fallback for the Characters list. characterName takes
    // precedence; otherwise show the most-specific identifier the user
    // has so far.
    const name =
      snapshot.characterName?.trim() ||
      snapshot.classKey ||
      snapshot.speciesKey ||
      null;

    if (currentDraftId) {
      const { error } = await updateCharacterDraft(currentDraftId, {
        name,
        data: data as never,
      });
      setSavingDraft(false);
      if (error) {
        setDraftSaveError('Failed to save draft.');
        return;
      }
    } else {
      const { data: row, error } = await createCharacterDraft({
        userId: user.id,
        name,
        data: data as never,
      });
      setSavingDraft(false);
      if (error || !row) {
        setDraftSaveError('Failed to save draft.');
        return;
      }
      setCurrentDraftId(row.id);
    }

    // Send the user back to the characters list where the draft now
    // surfaces. The wizard's working state stays in the store but
    // nothing's reading it once we navigate; resetDraft fires next
    // time the user taps "+ New".
    router.replace('/(drawer)/characters');
  }

  async function handleFinish() {
    if (!user || !draft.abilityScores || !draft.speciesKey || !draft.classKey || !draft.backgroundKey) return;
    setSaving(true);
    setSaveError('');

    try {
      // Pull every content kind through the same tier scoping the wizard
      // steps used to surface them. SRD-only here would silently swap a
      // homebrew class's proficiencies + features for whatever SRD class
      // happens to share its key, or — more likely — `cls` resolves to
      // undefined and the wizard errors out. Mirror the picker step's
      // scoping so the saved character carries the proficiencies / hit
      // die / origin feat / etc. of the *picked* content.
      const includeHomebrew = !!draft.campaignId || draft.selectedPackIds.length > 0;
      const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
      const packIds = !draft.campaignId && draft.selectedPackIds.length > 0 ? draft.selectedPackIds : undefined;
      const tierArgs = {
        system: 'dnd5e',
        srdVersion: draft.srdVersion,
        tiers,
        campaignId: draft.campaignId ?? undefined,
        packIds,
      } as const;
      const [clsResults, bgResults, speciesResults, featResults, itemResults] = await Promise.all([
        ContentResolver.search({ type: 'class',      ...tierArgs }),
        ContentResolver.search({ type: 'background', ...tierArgs }),
        ContentResolver.search({ type: 'species',    ...tierArgs }),
        draft.chosenFeats.length > 0
          ? ContentResolver.search({ type: 'feat', ...tierArgs })
          : Promise.resolve([]),
        // Items catalog — needed when the chosen background carries
        // structured starting equipment with `itemKey` references.
        // Empty pull when the background has no structured items, but
        // we can't know that until after we resolve the background;
        // fetching unconditionally is simpler than re-coordinating.
        ContentResolver.search({ type: 'item', ...tierArgs }),
      ]);
      const cls = (clsResults as ClassResult[]).find((c) => c.key === draft.classKey);
      const bg = (bgResults as BackgroundResult[]).find((b) => b.key === draft.backgroundKey);
      const sp = (speciesResults as SpeciesResult[]).find((s) => s.key === draft.speciesKey);

      if (!cls || !bg || !sp) {
        setSaveError('Could not load content. Please try again.');
        setSaving(false);
        return;
      }

      // Resolve the ASI context — who grants the +2/+1 (species in
      // 5.1, background in 5.2) and whether Customize Origin applies.
      // Same helper the wizard's Ability Scores step uses, so the
      // application here matches what the player saw in the preview.
      const customizeOrigin =
        (draftCampaignRules.customize_origin as boolean | undefined) !== false;
      const asiContext = computeAsiContext({
        species: sp,
        background: bg,
        srdVersion: draft.srdVersion,
        customizeOrigin,
      });
      const adjustedAbilityScores = applyAsiContext(
        asiContext,
        draft.abilityScores,
        draft.speciesAbilityChoices,
      );

      // Resolve picked feats into the character's `resources.feats[]`
      // shape. Skipped silently if the resolver couldn't find a feat —
      // wizard's draft can't easily land in this state, but a stale
      // pack opt-in could (e.g. user removed a pack between picking
      // and finishing). Better to drop the orphan than block creation.
      const chosenFeatRecords = (featResults as import('@vaultstone/types').FeatResult[])
        .filter((f) => draft.chosenFeats.includes(f.key));
      const featsForResources: import('@vaultstone/types').Dnd5eFeature[] =
        chosenFeatRecords.map((f) => ({
          id: f.key,
          name: f.name,
          description: [
            f.description ?? '',
            ...(f.benefits ?? []).map((b) => `• ${b}`),
          ].filter(Boolean).join('\n\n'),
        }));

      const conMod = Math.floor((draft.abilityScores.constitution - 10) / 2);
      // TODO(starting-level-progression): the campaign's `starting_level`
      // rule lands on the draft via bootstrap, but full level-N character
      // creation (HP per level, ability score improvements at L4/8/etc,
      // class features per level, scaling spell slots, multiclass-aware
      // progression) is a separate pass. v1 of the rules pipeline still
      // initializes the new character at L1 even when the rule says
      // higher; the next iteration on the wizard wires in level-up logic.
      const hpMax = cls.hitDie + conMod;

      // Seed the character's hit_point_method preference from the
      // campaign's resolved rule (or the system default for standalone
      // characters). The level-up flow reads this when granting
      // per-level HP — there's no L1 effect, since every PC takes max
      // HP at first level in both editions.
      const hitPointMethodSetting: 'fixed' | 'rolled' =
        draftCampaignRules.hit_point_method === 'rolled' ? 'rolled' : 'fixed';

      const base_stats: Dnd5eStats = {
        characterName: draft.characterName.trim(),
        level: 1,
        speciesKey: draft.speciesKey,
        classKey: draft.classKey,
        // Multi-class entry list. New characters always carry a
        // single-element array describing the primary class; the
        // level-up wizard appends more entries on multiclass. Legacy
        // characters without this field still work via the
        // getClassEntries() fallback in @vaultstone/types.
        classes: [
          {
            classKey: draft.classKey,
            level: 1,
            subclassKey: null,
            hitDie: cls.hitDie,
            primary: true,
          },
        ],
        backgroundKey: draft.backgroundKey,
        srdVersion: draft.srdVersion,
        abilityScores: adjustedAbilityScores,
        savingThrowProficiencies: cls.savingThrows.map((s) => s.toLowerCase()),
        // Merge class-chosen + background-granted skills, applying any
        // collision replacements the player picked on StepBackground.
        // The replacements map is keyed by lower-case original skill;
        // when present the replacement skill takes the slot. A final
        // dedupe via Set guards against pathological cases (e.g. a
        // homebrew background with duplicate entries in its own
        // skillProficiencies list).
        skillProficiencies: (() => {
          const out: string[] = [];
          const seen = new Set<string>();
          const push = (sk: string) => {
            const lc = sk.toLowerCase();
            if (seen.has(lc)) return;
            seen.add(lc);
            out.push(lc);
          };
          for (const sk of draft.chosenSkills) push(sk);
          for (const sk of bg.skillProficiencies) {
            const replacement = draft.backgroundSkillReplacements[sk.toLowerCase()];
            push(replacement ?? sk);
          }
          // Species-trait skill grants — fixed only (Owlin's Silent
          // Feathers → Stealth, Wood Elf's Keen Senses → Perception,
          // etc.). When count === from.length the wizard merges the
          // whole list automatically. Player-pick traits (count <
          // from.length, e.g. Half-Elf Skill Versatility) need a picker
          // — that's follow-up work.
          for (const trait of sp.traits ?? []) {
            const skillGrant = trait.grants?.skills;
            if (!skillGrant) continue;
            if (skillGrant.from.length === skillGrant.count) {
              for (const sk of skillGrant.from) push(sk);
            }
          }
          // Feat-granted skills (Skilled, etc.) — picked on StepFeats
          // and stored on the draft under `featPicks[featKey].skills`.
          // Merge them last; the Set guards against the picker
          // accidentally letting through a skill the player already has
          // from class / background.
          for (const featKey of draft.chosenFeats) {
            const picks = draft.featPicks[featKey];
            if (picks?.skills) {
              for (const sk of picks.skills) push(sk);
            }
          }
          return out;
        })(),
        armorProficiencies: cls.armorProficiencies,
        weaponProficiencies: cls.weaponProficiencies,
        toolProficiencies: bg.toolProficiency ? [bg.toolProficiency] : [],
        languages: [],
        hitDie: cls.hitDie,
        spellcastingAbility: cls.spellcastingAbility,
        originFeat: bg.originFeat,
        speed: (sp as any).speed ?? 30,
        hpMax,
        settings: {
          manualMode: false,
          hitPointMethod: hitPointMethodSetting,
        },
      };

      // ── Background starting equipment → inventory + coins ──────────
      // Resolve the background's structured starting equipment. When
      // the background has multi-option entries (A or B) we pick the
      // *first* option silently for v1 — the Review-step picker is a
      // follow-up. Items with an `itemKey` get resolved against the
      // catalog and converted to Dnd5eEquipmentItem; bare-name items
      // are skipped (the sheet still surfaces them in the bg detail).
      // Gold with a fixed `amount` accrues into starting coins; dice
      // expressions are skipped — the player rolls those themselves.
      const startingEquipmentArray = Array.isArray(bg.startingEquipment) ? bg.startingEquipment : [];
      const chosenEquipmentOption = startingEquipmentArray[0];
      const itemsByKey = new Map<string, ItemResult>(
        (itemResults as ItemResult[]).map((it) => [it.key, it]),
      );
      const inventory: Dnd5eEquipmentItem[] = [];
      const startingCoins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      if (chosenEquipmentOption) {
        for (const itemRef of (chosenEquipmentOption.items ?? [])) {
          const n = normalizeStartingEquipmentItem(itemRef);
          if (!n.itemKey) continue;
          const cataloged = itemsByKey.get(n.itemKey);
          if (!cataloged) continue;
          const eq = itemResultToEquipment(cataloged);
          // Honor the authored qty by adding multiple inventory rows.
          // Each row carries its own UUID via `eq.id` — the converter
          // generates a fresh id per call, but we get a single eq per
          // call here, so duplicate manually with a new id.
          const qty = n.qty && n.qty > 0 ? n.qty : 1;
          for (let i = 0; i < qty; i++) {
            inventory.push({ ...eq, id: `${eq.id}-${i}` });
          }
        }
        if (chosenEquipmentOption.gold && typeof chosenEquipmentOption.gold.amount === 'number') {
          const c = chosenEquipmentOption.gold.currency;
          startingCoins[c] += chosenEquipmentOption.gold.amount;
        }
      }
      const totalCoinValue =
        startingCoins.cp + startingCoins.sp + startingCoins.ep + startingCoins.gp + startingCoins.pp;

      const resources: Dnd5eResources = {
        hpCurrent: hpMax,
        hpTemp: 0,
        hitDiceRemaining: 1,
        inspiration: false,
        deathSaves: { successes: 0, failures: 0 },
        exhaustionLevel: 0,
        spellSlots: initSpellSlots(cls, 1),
        ...(featsForResources.length > 0 ? { feats: featsForResources } : {}),
        // Mirror the draft's per-feat picks (Skilled granted skills,
        // etc.) onto the created character so the Traits tab can show
        // which choices have been resolved.
        ...(Object.keys(draft.featPicks).length > 0 ? { featPicks: draft.featPicks } : {}),
        ...(inventory.length > 0 ? { equipment: inventory } : {}),
        ...(totalCoinValue > 0 ? { coins: startingCoins } : {}),
      };

      // ── starting_level > 1 bootstrap ─────────────────────────────
      // The campaign's starting_level rule lands on the draft via
      // bootstrap; we now run applyLevelUp() once per level above 1
      // so the new character lands at the correct level with the
      // right HP, spell slots, and class features. Sensible defaults
      // (max HP, no ASI/feat picked, no subclass picked) are used at
      // each level — the player can open the level-up wizard later
      // to claim any pending picks (subclass at unlock level, ASI
      // at L4/8/12/16/19).
      let bootstrappedStats = base_stats;
      let bootstrappedResources = resources;
      const targetLevel = Math.min(20, Math.max(1, Math.floor(draft.startingLevel ?? 1)));
      if (targetLevel > 1) {
        const classByKey = new Map([[cls.key, cls]]);
        for (let lvl = 2; lvl <= targetLevel; lvl++) {
          const hpGain = defaultHpGain(bootstrappedStats, cls);
          const featuresAtLevel = classFeaturesAtLevel(cls, lvl);
          const result = applyLevelUp(
            { stats: bootstrappedStats, resources: bootstrappedResources },
            {
              classKey: cls.key,
              newMulticlassEntry: false,
              hpGain,
              // Subclass + ASI picks are intentionally skipped — the
              // bootstrap doesn't have player input. The level-up
              // wizard surfaces them as owed picks the player resolves
              // when they open the character.
              classFeaturesUnlocked: unpackClassFeaturesForPick(featuresAtLevel),
            },
            cls,
            classByKey,
          );
          bootstrappedStats = result.stats;
          bootstrappedResources = result.resources;
        }
      }

      const { data, error } = await createCharacter({
        user_id: user.id,
        campaign_id: draft.campaignId ?? null,
        name: draft.characterName.trim(),
        system: draft.system,
        base_stats: bootstrappedStats as unknown as import('@vaultstone/types').Json,
        resources: bootstrappedResources as unknown as import('@vaultstone/types').Json,
        // Standalone characters persist their pack opt-in here; campaign
        // characters get [] because they inherit packs from campaign_packs.
        pack_ids: draft.campaignId ? [] : draft.selectedPackIds,
      });

      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }

      // Promotion to a real character; the draft (if any) has fulfilled
      // its purpose. Best-effort delete — failure here doesn't roll back
      // the character, just leaves an orphan draft the user can clean up.
      if (currentDraftId) {
        await deleteCharacterDraft(currentDraftId).catch(() => undefined);
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
    const loadingLabel = launchedDraftId ? 'Loading draft…' : 'Loading campaign…';
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.bootstrapWrap}>
          <Text style={s.bootstrapText}>
            {bootstrapError || loadingLabel}
          </Text>
          {bootstrapError ? (
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
        <TouchableOpacity
          onPress={handleSaveDraft}
          style={[s.headerSide, s.headerSideRight]}
          disabled={savingDraft}
          hitSlop={8}
        >
          <Text style={s.headerAction}>
            {savingDraft ? 'Saving…' : 'Save draft'}
          </Text>
        </TouchableOpacity>
      </View>
      {draftSaveError ? (
        <Text style={s.draftSaveError}>{draftSaveError}</Text>
      ) : null}
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
          {/* Campaign rules summary — collapsible, hidden on
              standalone characters and the fork screen (where the
              user hasn't committed to a campaign yet). Renders
              above the active step so the player has rules context
              before each decision. */}
          {/* Surface the campaign-rules summary once on the very first
              wizard step (skipping the dedicated ruleset/rules steps,
              which already cover the same ground). Previously this
              rendered above every step, which on mobile meant the
              player had to scroll past it on every page. */}
          {step === 0 && STEPS[step]?.key !== 'ruleset' && STEPS[step]?.key !== 'rules' ? <CampaignRulesSummary /> : null}
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
              case 'rules':
                return <StepRules />;
              case 'species':
                return <StepSpecies onPreviewChange={setInPreview} onAdvance={() => advanceTo('class')} />;
              case 'class':
                return <StepClass onPreviewChange={setInPreview} onAdvance={() => advanceTo('background')} />;
              case 'background':
                return <StepBackground
                  onPreviewChange={setInPreview}
                  onAdvance={() => advanceTo(STEPS.some((s) => s.key === 'feats') ? 'feats' : 'scores')}
                />;
              case 'feats':
                return <StepFeats onPreviewChange={setInPreview} onAdvance={() => advanceTo('scores')} />;
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
  headerSide: { width: 90 },
  headerSideRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerAction: {
    fontSize: 13, fontFamily: fonts.label, fontWeight: '600',
    color: colors.primary, letterSpacing: 0.3,
  },
  draftSaveError: {
    fontSize: 12,
    color: colors.hpDanger,
    fontFamily: fonts.body,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
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
