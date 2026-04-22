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
  /** Saved card order for the character sheet grid. */
  cardOrder?: string[];
  /** Persisted desktop two-column tab layout. */
  tabLayout?: {
    left: string[];
    right: string[];
    activeLeft: string;
    activeRight: string | null;
  };
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

  /** Creature size: Tiny, Small, Medium, Large, Huge, Gargantuan. */
  size?: string;

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
  /** Whether this item requires and is currently attuned */
  attuned?: boolean;
  /** Whether this item is a magic item requiring attunement */
  requiresAttunement?: boolean;
  /** Item weight in lbs */
  weight?: number;
}

export interface Dnd5eFeature {
  id: string;
  name: string;
  description: string;
  /** Optional: uses per rest, null if passive */
  uses?: { current: number; max: number; recharge: 'short' | 'long' } | null;
  /** If set, surfaces this feature in the Combat tab Actions section */
  actionType?: 'action' | 'bonus' | 'reaction' | 'free';
}

export interface Dnd5eSpellSlotLevel {
  max: number;
  remaining: number;
}

export interface Dnd5ePersonality {
  traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  allies?: string;
  faction?: string;
}

export interface Dnd5eAppearance {
  alignment?: string;
  age?: string;
  height?: string;
  weight?: string;
  eyes?: string;
  hair?: string;
  skin?: string;
}

export interface Dnd5eJournalEntry {
  id: string;
  title: string;
  body: string;
  date?: string;
  tags?: string[];
}

export interface Dnd5ePreparedSpell {
  id: string;
  name: string;
  /** 0 = cantrip */
  level: number;
  school?: string;
  ritual?: boolean;
  concentration?: boolean;
  notes?: string;
  /** Casting time abbreviation, e.g. '1A', '1m', 'Reaction' */
  castingTime?: string;
  /** Spell range, e.g. 'Self', 'Touch', '120 ft' */
  range?: string;
  /** Attack bonus or save string, e.g. '+5', 'DC 13', or '—' for no attack/save */
  hitDc?: string;
  /** Effect category, e.g. 'Utility', 'Damage', 'Buff', 'Control' */
  effectType?: string;
  /** Source feature or background that granted this spell, e.g. 'Elven Lineage' */
  source?: string;
}

/** Generic per-class resource pool: Barbarian rages, Ki points, Channel Divinity, etc. */
export interface Dnd5eClassResource {
  key: string;
  label: string;
  current: number;
  max: number;
  recharge?: 'short' | 'long';
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
  /** Treasure, gems, art objects, and other valuables. */
  treasure?: string;
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
  /** Name of the spell the character is currently concentrating on, or null. */
  concentrationSpell?: string | null;
  /** Optional class resource pools (rages, ki, superiority dice, etc.). */
  classResources?: Dnd5eClassResource[];
  /** Personality text fields (traits, ideals, bonds, flaws, backstory, allies, faction). */
  personality?: Dnd5ePersonality;
  /** Physical appearance fields. */
  appearance?: Dnd5eAppearance;
  /** Campaign journal entries. */
  journal?: Dnd5eJournalEntry[];
  /** Prepared spells and cantrips. */
  preparedSpells?: Dnd5ePreparedSpell[];
}

export interface PartyViewSettings {
  showHpNumbersToPlayers: boolean;
  showConditionsToPlayers: boolean;
  showSlotsToPlayers: boolean;
  showResourcesToPlayers: boolean;
  allowPlayerCrossView: boolean;
}

export const DEFAULT_PARTY_VIEW_SETTINGS: PartyViewSettings = {
  showHpNumbersToPlayers: true,
  showConditionsToPlayers: true,
  showSlotsToPlayers: true,
  showResourcesToPlayers: true,
  allowPlayerCrossView: false,
};
