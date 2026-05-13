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
  /**
   * Player's choice for how additional hit points are determined on
   * level-up. `'fixed'` grants the class's average (floor(die/2) + 1
   * + CON mod); `'rolled'` rolls the hit die. Seeded at creation
   * from the campaign's `hit_point_method` rule (or the system
   * default for standalone characters); the level-up flow reads
   * this when granting per-level HP. Defaults to `'fixed'` when
   * absent — matches the SRD bundled rule default.
   */
  hitPointMethod?: 'fixed' | 'rolled';
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
 * One entry in a character's class list. Multi-classed characters
 * carry multiple entries; single-classed characters carry one.
 *
 * `classKey` matches a `ClassResult.key` (edition-suffixed). The
 * `subclassKey` matches a `SubclassResult.key`; null until the
 * character reaches the class's subclass-unlock level. `hitDie`
 * snapshots the class's hit die at the level the entry was added,
 * matching the existing top-level `Dnd5eStats.hitDie` field's role.
 */
export interface Dnd5eClassEntry {
  classKey: string;
  level: number;
  subclassKey: string | null;
  hitDie: number;
  /**
   * Whether this entry was the *first* class on the character —
   * the primary class. The primary class confers the full set of
   * starting proficiencies (armor, weapons, tools, saves, two
   * skills); secondary classes only confer the multiclass-entry
   * subset. Exactly one entry per character carries `primary: true`.
   */
  primary: boolean;
}

/**
 * Shape of the `base_stats` JSON blob for a D&D 5e character.
 * Stores raw creation choices; all derived stats are computed at render time.
 */
export interface Dnd5eStats {
  characterName: string;
  /**
   * Total character level (sum of `classes[].level` when present,
   * or just the legacy single-class level when not). Kept on the
   * row for read-side simplicity in the sheet header, party view,
   * etc. — these surfaces don't care which class(es) the level
   * came from. The level-up wizard updates this in lockstep with
   * `classes[]` writes.
   */
  level: number;

  // Content selections (keys from ContentResolver)
  speciesKey: string;
  /**
   * Primary class key. Mirrored from `classes[]` (the entry with
   * `primary: true`) when that list is populated; held as the only
   * source of truth on legacy single-class characters that haven't
   * been migrated to the array form. Display surfaces (sheet
   * header, party view, character list) read this directly so they
   * keep working unchanged across the migration.
   */
  classKey: string;
  /**
   * Multi-class entries. Optional for backwards compat — characters
   * created before the level-up arc shipped don't have this field
   * and are treated as a single-class character whose `classKey` /
   * `level` / `hitDie` describe the lone entry. The level-up
   * wizard always writes this array; a single-class L1 character
   * created today carries a one-element array.
   */
  classes?: Dnd5eClassEntry[];
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

  /** Manual-mode override for AC (bypasses equipment-based calculation). */
  acOverride?: number;
  /** Manual-mode override for initiative bonus. */
  initiativeOverride?: number;

  /** Skills with expertise (double proficiency bonus). */
  skillExpertise?: string[];

  /** Player's pick-one selections for species traits with options.
   *  Keyed by trait name → chosen option name. */
  traitChoices?: Record<string, string>;

  /** Per-character settings. Optional for backwards compat with existing characters. */
  settings?: CharacterSettings;
}

/**
 * Read a character's class entries with the legacy single-class
 * fallback. Returns the `classes[]` array verbatim when present;
 * otherwise synthesizes a one-element array from the legacy
 * top-level `classKey` / `level` / `hitDie` fields. Use this in
 * any code path that needs the per-class breakdown (level-up,
 * spell-slot computation, multiclass prereq checks); display code
 * that just wants a primary class label can keep reading
 * `stats.classKey` directly.
 */
export function getClassEntries(stats: Dnd5eStats): Dnd5eClassEntry[] {
  if (stats.classes && stats.classes.length > 0) return stats.classes;
  return [
    {
      classKey: stats.classKey,
      level: stats.level,
      subclassKey: null,
      hitDie: stats.hitDie,
      primary: true,
    },
  ];
}

/**
 * Find the primary class entry — the entry the character started
 * with, source of starting proficiencies and most display labels.
 * Falls through to the synthetic legacy entry when no `classes[]`
 * is present.
 */
export function getPrimaryClassEntry(stats: Dnd5eStats): Dnd5eClassEntry {
  const entries = getClassEntries(stats);
  return entries.find((e) => e.primary) ?? entries[0];
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

export interface Dnd5eAbility {
  id: string;
  name: string;
  description: string;
  source: string;
  actionType?: 'action' | 'bonus' | 'reaction' | 'free' | 'passive';
  uses?: { current: number; max: number; recharge: 'short' | 'long' | 'dawn' } | null;
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
  /** Component letters list — ['V','S','M']. Populated when added through
   *  the catalog picker; absent on legacy entries. */
  components?: string[];
  /** Duration string from the catalog — '1 minute', 'Concentration, up to 1 minute', etc. */
  duration?: string;
  /** Full spell description copied from the catalog, used by the inline
   *  expand on the Spells tab. Optional so legacy entries (added before
   *  the modal back-filled this) still load cleanly. */
  description?: string;
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
  /**
   * Active prepared spells + cantrips — the subset of `spellbook[]`
   * the character can actually cast right now. Cantrips always read
   * from this list (they don't get "unprepared" in 5e); leveled spells
   * here represent what the player toggled on after a long rest.
   *
   * For pre-spellbook characters (created before the Manage/Prepare
   * split landed), this is also the de-facto spellbook. The
   * `getSpellbook` helper below normalizes both shapes.
   */
  preparedSpells?: Dnd5ePreparedSpell[];

  /**
   * Every spell the character has learned — i.e. the master pool the
   * Prepare Spells modal picks from. Populated by the Manage Spells
   * modal (catalog → spellbook). For known-list classes (5.1 Sorcerer
   * / Bard / Ranger / Warlock) this is the only list; the prepared/
   * spellbook split collapses since every known spell is always cast-
   * able. For prepare-list classes (Wizard, Cleric, etc.) this carries
   * the wider pool the player chose during downtime / level-up, and
   * `preparedSpells[]` carries today's active subset.
   *
   * Optional + nullable so legacy character rows (no spellbook field
   * yet) stay readable — see `getSpellbook` for the normalization.
   */
  spellbook?: Dnd5ePreparedSpell[];
  /** Tracked abilities — class features, racial abilities, item-granted
   *  powers, etc. with optional use counters and recharge tracking. */
  abilities?: Dnd5eAbility[];
}

/**
 * Resolve a character's full spellbook regardless of whether the row
 * predates the Manage/Prepare split. New characters write to
 * `resources.spellbook[]`; legacy characters only have
 * `preparedSpells[]`, so we treat that as the spellbook too. Always
 * dedupes by id so the merged shape stays stable when both fields
 * are populated mid-migration.
 */
export function getSpellbook(resources: Dnd5eResources | null | undefined): Dnd5ePreparedSpell[] {
  if (!resources) return [];
  if (resources.spellbook && resources.spellbook.length > 0) {
    return resources.spellbook;
  }
  return resources.preparedSpells ?? [];
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
