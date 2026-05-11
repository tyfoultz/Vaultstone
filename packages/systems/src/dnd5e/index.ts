import type { GameSystemDefinition } from '@vaultstone/types';
import { attributes } from './attributes';
import { resourcePools } from './resources';
import { creationSteps } from './creation-steps';
import { optionalRules } from './optional-rules';

export { checkPrerequisites, type PrereqCharacter, type PrereqCheckResult } from './prerequisites';
export {
  spellSlotsForClassAtLevel,
  spellSlotsForCharacter,
  casterTypeFor,
  averageHpForDie,
  hpGainForLevel,
  classFeaturesAtLevel,
  isSubclassUnlockLevel,
  isAsiLevel,
  checkMulticlassPrereqs,
  proficiencyBonusForLevel,
  totalLevel,
  conModifier,
  type SpellSlotsByLevel,
  type CasterType,
  type MulticlassCheckResult,
} from './leveling';
export {
  applyLevelUp,
  defaultHpGain,
  unpackClassFeaturesForPick,
  type LevelUpPick,
  type ApplyLevelUpResult,
} from './apply-level-up';
export {
  computeAsiContext,
  applyAsiContext,
  asiContextComplete,
  type AsiContext,
  type AsiMode,
} from './asi-context';

// Both editions share schema (attributes, resources, sheet, creation steps).
// They diverge only in id / displayName / version / SRD-content filter.
const SHEET_SECTIONS: GameSystemDefinition['sheetSections'] = [
  { key: 'ability_scores', label: 'Ability Scores', order: 1 },
  { key: 'combat',         label: 'Combat',           order: 2 },
  { key: 'spells',         label: 'Spells',           order: 3 },
  { key: 'features',       label: 'Features & Traits', order: 4 },
  { key: 'equipment',      label: 'Equipment',        order: 5 },
  { key: 'notes',          label: 'Notes',            order: 6 },
];

export const dnd5e2014System: GameSystemDefinition = {
  id: 'dnd5e_2014',
  displayName: 'D&D 5e (2014)',
  version: '2014',
  license: 'CC-BY-4.0',
  isBundled: true,
  srdVersion: 'SRD_5.1',
  attributes,
  resourcePools,
  creationSteps,
  optionalRules,
  sheetSections: SHEET_SECTIONS,
};

export const dnd5e2024System: GameSystemDefinition = {
  id: 'dnd5e_2024',
  displayName: 'D&D 5e (2024)',
  version: '2024',
  license: 'CC-BY-4.0',
  isBundled: true,
  srdVersion: 'SRD_2.0',
  attributes,
  resourcePools,
  creationSteps,
  optionalRules,
  sheetSections: SHEET_SECTIONS,
};

/**
 * Backwards-compat alias. Existing data and code paths that reference
 * `dnd5eSystem` resolve to the 2024 edition until they migrate to a
 * specific id. Keep this around until characters/campaigns store the
 * edition-qualified id directly.
 */
export const dnd5eSystem: GameSystemDefinition = dnd5e2024System;
