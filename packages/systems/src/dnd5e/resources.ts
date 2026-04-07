import type { ResourcePool } from '@vaultstone/types';

export const resourcePools: ResourcePool[] = [
  { key: 'hit_points', label: 'Hit Points', max: null, recharge: 'long_rest' },
  { key: 'hit_dice', label: 'Hit Dice', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_1', label: 'Spell Slots (1st)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_2', label: 'Spell Slots (2nd)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_3', label: 'Spell Slots (3rd)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_4', label: 'Spell Slots (4th)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_5', label: 'Spell Slots (5th)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_6', label: 'Spell Slots (6th)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_7', label: 'Spell Slots (7th)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_8', label: 'Spell Slots (8th)', max: null, recharge: 'long_rest' },
  { key: 'spell_slot_9', label: 'Spell Slots (9th)', max: null, recharge: 'long_rest' },
  { key: 'inspiration', label: 'Inspiration', max: 1, recharge: 'daily' },
];
