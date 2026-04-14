/**
 * Typed shapes for the `base_stats` and `resources` JSON columns
 * on the `characters` table for D&D 5e characters.
 *
 * Derived values (modifiers, proficiency bonus, AC, saving throws, skill
 * totals) are NOT stored here — they are computed at render time from the
 * raw values below.
 */

export interface CharacterSettings {
  /** When true, all fields are manually editable by the player. */
  manualMode: boolean;
}

export interface Dnd5eAbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

/**
 * Shape of the `base_stats` JSON blob for a D&D 5e character.
 * Stores raw creation choices; all derived stats are computed at render time.
 */
export interface Dnd5eStats {
  characterName: string;
  /** Always 1 at creation; incremented on level-up (future feature). */
  level: number;

  // Content selections (keys from ContentResolver)
  speciesKey: string;
  classKey: string;
  backgroundKey: string;
  /** Which SRD version the character was built with. */
  srdVersion: 'SRD_5.1' | 'SRD_2.0';

  abilityScores: Dnd5eAbilityScores;

  // Proficiencies
  /** Ability score keys, e.g. ['strength', 'constitution'] */
  savingThrowProficiencies: string[];
  /** Skill name keys, e.g. ['athletics', 'perception'] */
  skillProficiencies: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];

  // Snapshotted from ClassResult at creation time
  hitDie: number;
  spellcastingAbility: string | null;

  // Snapshotted from BackgroundResult at creation time
  originFeat: string;

  /** Base movement speed in feet, from species. */
  speed: number;

  /** hitDie + CON modifier, computed and stored at creation/level-up. */
  hpMax: number;

  /** Per-character settings. Optional for backwards compat with existing characters. */
  settings?: CharacterSettings;
}

export type EquipmentSlot = 'weapon' | 'armor' | 'shield' | 'other';

export interface Dnd5eEquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  equipped: boolean;
  /** For weapons: e.g. '1d8+3 slashing' */
  damage?: string;
  /** For weapons: attack modifier override, or auto-calculated from ability + prof */
  attackBonus?: number;
  /** For weapons: which ability to use — 'strength' | 'dexterity' | 'finesse' */
  attackAbility?: 'strength' | 'dexterity' | 'finesse';
  /** For weapons: properties like 'light', 'finesse', 'two-handed', 'ranged', 'thrown' */
  properties?: string[];
  /** For weapons: range in feet, e.g. '80/320' or '5' */
  range?: string;
  /** For armor: base AC provided */
  acBase?: number;
  /** For armor: whether DEX modifier applies (and max if capped, e.g. 2) */
  dexCap?: number | null;
  /** For shields: AC bonus (typically +2) */
  acBonus?: number;
  /** Freeform notes */
  notes?: string;
}

export interface Dnd5eFeature {
  id: string;
  name: string;
  description: string;
  /** Optional: uses per rest, null if passive */
  uses?: { current: number; max: number; recharge: 'short' | 'long' } | null;
}

export interface Dnd5eSpellSlotLevel {
  max: number;
  remaining: number;
}

/**
 * Shape of the `resources` JSON blob for a D&D 5e character.
 * Tracks mutable runtime state that changes during play.
 */
export interface Dnd5eResources {
  hpCurrent: number;
  hpTemp: number;
  hitDiceRemaining: number;
  inspiration: boolean;
  deathSaves: {
    successes: number;
    failures: number;
  };
  /** Exhaustion level 0–6. 0 = no exhaustion. */
  exhaustionLevel: number;
  /** Experience points. */
  xp?: number;
  /** Equipment inventory. */
  equipment?: Dnd5eEquipmentItem[];
  /** Class features. */
  classFeatures?: Dnd5eFeature[];
  /** Species traits. */
  speciesTraits?: Dnd5eFeature[];
  /** Feats. */
  feats?: Dnd5eFeature[];
  /** Coin pouch. */
  coins?: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };
  /** Freetext scratchpad notes. */
  notes?: string;
  /** Spell slots by level. Only populated for spellcasting classes. */
  spellSlots: {
    1: Dnd5eSpellSlotLevel;
    2: Dnd5eSpellSlotLevel;
    3: Dnd5eSpellSlotLevel;
    4: Dnd5eSpellSlotLevel;
    5: Dnd5eSpellSlotLevel;
    6: Dnd5eSpellSlotLevel;
    7: Dnd5eSpellSlotLevel;
    8: Dnd5eSpellSlotLevel;
    9: Dnd5eSpellSlotLevel;
  } | null;
}
