export { dnd5eSystem, dnd5e2014System, dnd5e2024System } from './dnd5e';
export { getAbilityAttributes, type AbilityAttributeMetadata } from './dnd5e/attributes';
export {
  checkPrerequisites,
  type PrereqCharacter,
  type PrereqCheckResult,
} from './dnd5e/prerequisites';
export { getEquippedAC, getUnarmoredDefense, type UnarmoredDefenseChoice } from './dnd5e/armor-class';
export {
  spellSlotsForClassAtLevel,
  spellSlotsForCharacter,
  casterTypeFor,
  casterTypeForEntry,
  resolveSubclassCasting,
  getEffectiveSpellcastingAbility,
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
} from './dnd5e/leveling';
export {
  applyLevelUp,
  defaultHpGain,
  unpackClassFeaturesForPick,
  type LevelUpPick,
  type ApplyLevelUpResult,
} from './dnd5e/apply-level-up';
export {
  computeAsiContext,
  applyAsiContext,
  asiContextComplete,
  type AsiContext,
  type AsiMode,
} from './dnd5e/asi-context';
export {
  resolveCreationSteps,
  type CreationStepContext,
} from './resolve-creation-steps';
export { customSystem } from './custom';
export { BUNDLED_SYSTEMS_BY_ID, BUNDLED_SYSTEMS_ORDER } from './registry';
export * from './types';
