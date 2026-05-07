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
}

interface CharacterDraftActions {
  setStep: (step: number) => void;
  setRuleset: (system: string, srdVersion: 'SRD_5.1' | 'SRD_2.0') => void;
  setRulesetMode: (mode: RulesetMode) => void;
  setSpecies: (key: string) => void;
  setClass: (key: string) => void;
  setChosenSkills: (skills: string[]) => void;
  setBackground: (key: string) => void;
  setAbilityScoreMethod: (method: AbilityScoreMethod) => void;
  setAbilityScores: (scores: Dnd5eAbilityScores) => void;
  setStartingLevel: (level: number) => void;
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
  abilityScoreMethod: 'standard_array',
  abilityScores: null,
  startingLevel: 1,
  characterName: '',
  campaignId: null,
  selectedPackIds: [],
};

export const useCharacterDraftStore = create<CharacterDraft & CharacterDraftActions>()(
  persist(
    (set) => ({
      ...INITIAL_DRAFT,

      setStep: (currentStep) => set({ currentStep }),

      setRuleset: (system, srdVersion) => set({ system, srdVersion }),

      setRulesetMode: (rulesetMode) => set({ rulesetMode }),

      setSpecies: (speciesKey) => set({ speciesKey }),

      setClass: (classKey) => set({ classKey, chosenSkills: [] }),

      setChosenSkills: (chosenSkills) => set({ chosenSkills }),

      setBackground: (backgroundKey) => set({ backgroundKey }),

      setAbilityScoreMethod: (abilityScoreMethod) =>
        set({ abilityScoreMethod, abilityScores: null }),

      setAbilityScores: (abilityScores) => set({ abilityScores }),

      setStartingLevel: (startingLevel) => set({ startingLevel }),

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
