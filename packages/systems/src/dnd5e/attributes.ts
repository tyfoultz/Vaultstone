import type { AttributeDefinition } from '@vaultstone/types';

// Per-attribute presentation metadata. The wizard's ability-score
// step renders a row per `kind: 'ability'` entry, sourced from the
// system's `attributes[]` via `getAbilityAttributes()`. Adding `short`
// + `description` here so the step doesn't need its own parallel
// label/description tables.
export interface AbilityAttributeMetadata {
  /** Three-letter abbreviation shown on score chips ("STR", "DEX"). */
  short: string;
  /** One-line description shown under the row label. */
  description: string;
}

const ABILITY_METADATA: Record<string, AbilityAttributeMetadata> = {
  strength:     { short: 'STR', description: 'Lifting, breaking, brawling.' },
  dexterity:    { short: 'DEX', description: 'Agility, reflexes and stealth.' },
  constitution: { short: 'CON', description: 'Endurance and hit points.' },
  intelligence: { short: 'INT', description: 'Memory, analysis, arcana.' },
  wisdom:       { short: 'WIS', description: 'Perception, insight, nature.' },
  charisma:     { short: 'CHA', description: 'Persuasion, deception, command.' },
};

export const attributes: AttributeDefinition[] = [
  { key: 'strength', label: 'Strength', type: 'number' },
  { key: 'dexterity', label: 'Dexterity', type: 'number' },
  { key: 'constitution', label: 'Constitution', type: 'number' },
  { key: 'intelligence', label: 'Intelligence', type: 'number' },
  { key: 'wisdom', label: 'Wisdom', type: 'number' },
  { key: 'charisma', label: 'Charisma', type: 'number' },
  { key: 'strength_modifier', label: 'STR Mod', type: 'number', derivedFrom: 'strength', derivation: 'modifier_5e' },
  { key: 'dexterity_modifier', label: 'DEX Mod', type: 'number', derivedFrom: 'dexterity', derivation: 'modifier_5e' },
  { key: 'constitution_modifier', label: 'CON Mod', type: 'number', derivedFrom: 'constitution', derivation: 'modifier_5e' },
  { key: 'intelligence_modifier', label: 'INT Mod', type: 'number', derivedFrom: 'intelligence', derivation: 'modifier_5e' },
  { key: 'wisdom_modifier', label: 'WIS Mod', type: 'number', derivedFrom: 'wisdom', derivation: 'modifier_5e' },
  { key: 'charisma_modifier', label: 'CHA Mod', type: 'number', derivedFrom: 'charisma', derivation: 'modifier_5e' },
  { key: 'armor_class', label: 'Armor Class', type: 'number' },
  { key: 'initiative', label: 'Initiative', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'number' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'proficiency_bonus', label: 'Proficiency Bonus', type: 'number' },
];

/**
 * Filter the system's `attributes` to just the raw ability scores
 * the player assigns in StepAbilityScores. Excludes derived
 * (modifier) entries and combat stats (AC, init, speed, level,
 * prof). The wizard renders one row per result.
 */
export function getAbilityAttributes(
  attrs: AttributeDefinition[],
): Array<AttributeDefinition & AbilityAttributeMetadata> {
  return attrs
    .filter((a) => a.type === 'number' && !a.derivedFrom && ABILITY_METADATA[a.key])
    .map((a) => ({ ...a, ...ABILITY_METADATA[a.key] }));
}

/** Calculate a D&D 5e ability score modifier: floor((score - 10) / 2) */
export function modifier5e(score: number): number {
  return Math.floor((score - 10) / 2);
}
