import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dnd5eAbilityScores } from '@vaultstone/types';

export type AbilityScoreMethod = 'roll_dice' | 'standard_array' | 'point_buy' | 'roll';

/**
 * Stage 0 of the Ruleset step asks "where will this character play?" —
 * `null` means the user hasn't picked a path yet (we show the fork
 * screen). Once they pick, we either route to a campaign picker
 * (`campaign`) or a standalone ruleset picker (`standalone`). The wizard
 * parent reads this to gate the Next button — without an explicit choice,
 * tapping Next would silently accept the default standalone ruleset.
 */
export type RulesetMode = 'campaign' | 'standalone' | null;

export interface CharacterDraft {
  /** Which wizard step the user last reached (0-indexed). */
  currentStep: number;

  // Step 0 — Ruleset
  system: string;
  srdVersion: 'SRD_5.1' | 'SRD_2.0';
  /** Two-stage ruleset flow — see RulesetMode. */
  rulesetMode: RulesetMode;

  // Step 1 — Species
  speciesKey: string | null;

  // Step 2 — Class
  classKey: string | null;
  /** Skill proficiencies chosen from the class pick list. */
  chosenSkills: string[];

  // Step 3 — Background
  backgroundKey: string | null;

  /**
   * Replacement skills for background-granted skill proficiencies
   * the character already has from another source (typically the
   * class). Map shape is `{ originalSkill: replacementSkill }`,
   * both lower-cased. Per the SRD: "If a feature lets you gain a
   * skill proficiency you already have, you can choose a different
   * skill." The wizard surfaces a chip-row on the Background detail
   * panel for each conflicting skill so the player picks the
   * replacement; handleFinish merges these into `skillProficiencies`.
   */
  backgroundSkillReplacements: Record<string, string>;

  /**
   * Player picks for the species' `abilityScoreChoices` clauses (5.1
   * Half-Elf and similar "+1 to two abilities of your choice" cases).
   * Keyed by ability — value is the amount the player chose to add
   * via the choice clause. Empty when the species ships no choices.
   * Surfaced as ability pickers on the Ability Scores wizard step.
   */
  speciesAbilityChoices: Record<string, number>;

  // Step 4 — Ability Scores
  abilityScoreMethod: AbilityScoreMethod;
  abilityScores: Dnd5eAbilityScores | null;

  /**
   * Level the character starts at. Defaults to 1, but campaign-linked
   * characters inherit the DM's `starting_level` rule when the wizard
   * bootstraps (one-shots, mid-campaign joins, etc.). Standalone
   * characters always start at 1; the wizard doesn't surface a level
   * picker for those.
   */
  startingLevel: number;

  /**
   * Feats picked during creation, by feat key. Populated when the
   * campaign rule `feats_at_level_1` is on (the wizard inserts a
   * Feats step) or when the standalone wizard surfaces a feat
   * picker. Empty for campaigns that disable the L1 feat. The
   * background's auto-granted Origin Feat is recorded separately
   * via the BackgroundResult, not here — this list is the player's
   * additional picks.
   */
  chosenFeats: string[];

  // Step 5 — Review & Finalize
  characterName: string;

  // Optional campaign linkage (set via post-join prompt, not required during wizard)
  campaignId: string | null;

  /**
   * Standalone-mode opt-in for homebrew packs. Empty for campaign-linked
   * characters (those inherit from the campaign's enabled packs) and for
   * standalone characters who didn't pick any packs. The wizard's content
   * pickers consume this to scope the homebrew tier.
   */
  selectedPackIds: string[];

  /**
   * Resolved character-creation rules from the linked campaign,
   * keyed by rule.key. Populated on bootstrap when the wizard is
   * launched with ?campaignId=. Empty object for standalone
   * characters (no rules apply, so steps fall back to the system
   * defaults). The shape of each value depends on the rule's type
   * (`boolean` / `string` / `number`); consumers narrow at read
   * time. Wizard steps read this to gate content (multiclass off
   * → no multiclass step, customize-origin off → species step
   * locks ability bonuses, etc.) and the wizard parent surfaces a
   * read-only "campaign rules" summary so the player knows what
   * they're playing under.
   */
  campaignRules: Record<string, boolean | string | number>;
}

interface CharacterDraftActions {
  setStep: (step: number) => void;
  setRuleset: (system: string, srdVersion: 'SRD_5.1' | 'SRD_2.0') => void;
  setRulesetMode: (mode: RulesetMode) => void;
  setSpecies: (key: string) => void;
  setClass: (key: string) => void;
  setChosenSkills: (skills: string[]) => void;
  setBackground: (key: string) => void;
  setBackgroundSkillReplacements: (map: Record<string, string>) => void;
  setSpeciesAbilityChoices: (map: Record<string, number>) => void;
  setChosenFeats: (keys: string[]) => void;
  setAbilityScoreMethod: (method: AbilityScoreMethod) => void;
  setAbilityScores: (scores: Dnd5eAbilityScores) => void;
  setStartingLevel: (level: number) => void;
  setCampaignRules: (rules: Record<string, boolean | string | number>) => void;
  setCharacterName: (name: string) => void;
  setCampaignId: (id: string | null) => void;
  setSelectedPackIds: (ids: string[]) => void;
  /**
   * Bulk-set the working state from a saved server-side draft. Resets to
   * INITIAL_DRAFT first so any field absent from `partial` lands at its
   * default rather than retaining whatever leaked from a prior session.
   */
  hydrateFromSnapshot: (partial: Partial<CharacterDraft>) => void;
  resetDraft: () => void;
}

const INITIAL_DRAFT: CharacterDraft = {
  currentStep: 0,
  system: 'dnd5e',
  srdVersion: 'SRD_5.1',
  rulesetMode: null,
  speciesKey: null,
  classKey: null,
  chosenSkills: [],
  backgroundKey: null,
  backgroundSkillReplacements: {},
  speciesAbilityChoices: {},
  chosenFeats: [],
  abilityScoreMethod: 'standard_array',
  abilityScores: null,
  startingLevel: 1,
  characterName: '',
  campaignId: null,
  selectedPackIds: [],
  campaignRules: {},
};

export const useCharacterDraftStore = create<CharacterDraft & CharacterDraftActions>()(
  persist(
    (set) => ({
      ...INITIAL_DRAFT,

      setStep: (currentStep) => set({ currentStep }),

      setRuleset: (system, srdVersion) => set({ system, srdVersion }),

      setRulesetMode: (rulesetMode) => set({ rulesetMode }),

      setSpecies: (speciesKey) => set({ speciesKey, speciesAbilityChoices: {} }),

      setClass: (classKey) => set({ classKey, chosenSkills: [], backgroundSkillReplacements: {} }),

      setChosenSkills: (chosenSkills) => set({ chosenSkills, backgroundSkillReplacements: {} }),

      setBackground: (backgroundKey) => set({ backgroundKey }),

      setBackgroundSkillReplacements: (backgroundSkillReplacements) => set({ backgroundSkillReplacements }),

      setSpeciesAbilityChoices: (speciesAbilityChoices) => set({ speciesAbilityChoices }),

      setChosenFeats: (chosenFeats) => set({ chosenFeats }),

      setAbilityScoreMethod: (abilityScoreMethod) =>
        set({ abilityScoreMethod, abilityScores: null }),

      setAbilityScores: (abilityScores) => set({ abilityScores }),

      setStartingLevel: (startingLevel) => set({ startingLevel }),

      setCampaignRules: (campaignRules) => set({ campaignRules }),

      setCharacterName: (characterName) => set({ characterName }),

      setCampaignId: (campaignId) => set({ campaignId }),

      setSelectedPackIds: (selectedPackIds) => set({ selectedPackIds }),

      hydrateFromSnapshot: (partial) => set({ ...INITIAL_DRAFT, ...partial }),

      resetDraft: () => set(INITIAL_DRAFT),
    }),
    {
      name: 'character-draft',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
