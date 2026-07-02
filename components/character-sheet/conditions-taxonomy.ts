// Shared condition taxonomy — the single source of truth for which
// status effects are debuffs (negative), buffs (positive boons), or
// player-authored one-offs (custom). Conditions are still stored as a
// flat `characters.conditions` string[]; polarity is *derived* from the
// name here so every surface (character sheet, party panel, party card,
// combat tracker) colors and groups them consistently with no schema
// change.

export type ConditionPolarity = 'negative' | 'positive' | 'custom';

// Canonical SRD debuffs. `Invisible` is technically an SRD condition but
// reads as a boon at the table, so it's classified positive below and
// intentionally omitted here.
const NEGATIVE_NAMES = new Set([
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone',
  'restrained', 'stunned', 'unconscious',
]);

export interface PositiveCondition {
  name: string;
  description: string;
}

// Built-in beneficial conditions — the common table buffs. Surfaced in
// every condition picker under a "Boons" group. `Invisible` overlaps the
// SRD catalog; pickers dedupe by name (keeping the richer SRD entry) but
// still render it under Boons via the classifier.
export const POSITIVE_CONDITIONS: PositiveCondition[] = [
  { name: 'Blessed', description: 'Add 1d4 to attack rolls and saving throws (Bless).' },
  { name: 'Hasted', description: 'Speed doubled, +2 AC, advantage on Dexterity saves, and one extra limited action (Haste).' },
  { name: 'Inspiration', description: 'Holding DM-awarded Inspiration; spend for advantage on one attack roll, ability check, or saving throw.' },
  { name: 'Bardic Inspiration', description: 'Holding a Bardic Inspiration die to add to one attack roll, ability check, or saving throw.' },
  { name: 'Invisible', description: 'Unseen without magic or a special sense; attacks against you have disadvantage and your attacks have advantage.' },
  { name: 'Concentrating', description: 'Maintaining concentration on an ongoing spell.' },
  { name: 'Hidden', description: 'Unseen and unheard — your attacks have advantage and your position is unknown.' },
  { name: 'Flying', description: 'You have a flying speed for the duration.' },
  { name: 'Raging', description: 'Bonus melee damage, advantage on Strength checks and saves, and resistance to bludgeoning, piercing, and slashing damage (Rage).' },
  { name: 'Shielded', description: '+5 bonus to AC until the start of your next turn, including against the triggering attack (Shield).' },
  { name: 'Aided', description: 'Your hit point maximum and current hit points are increased (Aid).' },
];

const POSITIVE_NAMES = new Set(POSITIVE_CONDITIONS.map((c) => c.name.toLowerCase()));

/**
 * Classify a condition name. Optional `catalog` lets a homebrew/imported
 * condition declare its own polarity via a `category` field ('boon' →
 * positive, 'condition' → negative) — future-proofing; the built-in
 * lists win otherwise. Anything unrecognized is a player-authored
 * custom condition.
 */
export function conditionPolarity(
  name: string,
  catalog?: Array<{ name: string; category?: string }>,
): ConditionPolarity {
  const lower = name.trim().toLowerCase();
  const cat = catalog?.find((c) => c.name.toLowerCase() === lower);
  if (cat?.category === 'boon') return 'positive';
  if (cat?.category === 'condition') return 'negative';
  if (POSITIVE_NAMES.has(lower)) return 'positive';
  if (NEGATIVE_NAMES.has(lower)) return 'negative';
  return 'custom';
}
