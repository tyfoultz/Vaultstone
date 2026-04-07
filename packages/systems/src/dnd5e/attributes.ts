import type { AttributeDefinition } from '@vaultstone/types';

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

/** Calculate a D&D 5e ability score modifier: floor((score - 10) / 2) */
export function modifier5e(score: number): number {
  return Math.floor((score - 10) / 2);
}
