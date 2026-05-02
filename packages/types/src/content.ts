export type ContentTier = 'srd' | 'local' | 'homebrew';

export type ContentType =
  | 'spell'
  | 'monster'
  | 'item'
  | 'class'
  | 'subclass'
  | 'species'
  | 'feature'
  | 'background'
  | 'feat'
  | 'condition'
  | 'skill'
  | 'damage-type'
  | 'school'
  | 'size'
  | 'language'
  | 'action-type'
  | 'weapon-property'
  | 'weapon-mastery'
  | 'standard-action'
  | 'sense'
  | 'speed'
  | 'creature-type'
  | 'alignment'
  | 'currency'
  | 'tool'
  | 'magic-item-category'
  | 'cover';

export interface ContentResult {
  key: string;
  name: string;
  type: ContentType;
  tier: ContentTier;
  system: string;
  // Description text is only included for SRD and homebrew tiers.
  // Local (user-uploaded) descriptions stay on-device and are fetched separately.
  description?: string;
  data: Record<string, unknown>;
}

export interface SpellResult extends ContentResult {
  type: 'spell';
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string[];
  duration: string;
  concentration: boolean;
  /** Whether the spell can be cast as a ritual (10 extra minutes, no slot). */
  ritual: boolean;
  classes: string[];
  srdVersions: string[];
}

export interface CreatureResult extends ContentResult {
  type: 'monster';
  challengeRating: string | number;
  xp?: number;
  proficiencyBonus?: number;
  size: string;
  creatureType: string;
  alignment: string;
  ac: number;
  armorDetail?: string;
  hp: number;
  hitDice?: string;
  speed: string;
  speeds?: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
  abilityScores?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  abilityModifiers?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  /** Proficient saves only — { ability: total bonus }. */
  savingThrows?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>;
  /** Proficient skills only — { skillKey: total bonus }. Snake_case skill keys. */
  skills?: Record<string, number>;
  senses?: { darkvision?: number; blindsight?: number; tremorsense?: number; truesight?: number; passivePerception?: number };
  languages?: string;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  traits?: { name: string; description: string }[];
  actions?: { name: string; description: string; actionType?: string }[];
  environments?: string[];
  srdVersions: string[];
}

export interface ItemResult extends ContentResult {
  type: 'item';
  /**
   * Coarse category — drives grouping in the per-system catalog. Tools have
   * their own dedicated content type (`ToolResult`), so 'tool' is intentionally
   * not a valid item category.
   */
  category: 'weapon' | 'armor' | 'shield' | 'adventuring-gear' | 'magic-item' | 'crafting-equipment';
  /** Canonical SRD cost. `null` for items without listed price. */
  cost?: { amount: number; currency: 'cp' | 'sp' | 'ep' | 'gp' | 'pp' } | null;
  /** Weight in pounds. */
  weight?: number;
  /** Loose properties list — weapon properties, armor donning notes, etc. */
  properties?: string[];
  /** Whether the item requires attunement before its magical effects apply. */
  requiresAttunement?: boolean;
  /** Standard 5e magic-item rarity. */
  rarity?: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';
  srdVersions: string[];
}

export interface FeatResult extends ContentResult {
  type: 'feat';
  /** Origin (taken via background), General (taken via ASI), Fighting Style, Epic Boon. */
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** Free-form prerequisite text (e.g. "Strength 13+", "level 4+"). Empty string if none. */
  prerequisites?: string;
  /** Bullet-form benefits. */
  benefits: string[];
  srdVersions: string[];
}

export interface ConditionResult extends ContentResult {
  type: 'condition';
  /** Mechanical effects — one bullet per rule. */
  effects: string[];
  srdVersions: string[];
}

export interface SubclassResult extends ContentResult {
  type: 'subclass';
  /**
   * Key of the parent class — must match a `ClassResult.key` exactly so the
   * class detail page can filter its subclasses. Keys are edition-suffixed
   * (e.g. `barbarian-srd-2-0`), so a single subclass with diverged 5.1/2024
   * features ships as two records pointing at the matching edition's class.
   */
  parentClassKey: string;
  /** Display name of the parent class ("Barbarian", "Wizard"). */
  parentClassName?: string;
  /** Level at which a character chooses this subclass branch. */
  unlockLevel: number;
  /** Featured class abilities granted by this subclass at specific levels. */
  features?: Array<{ level: number; name: string; description: string }>;
  srdVersions: string[];
}

// -----------------------------------------------------------------------------
// Catalog content types — short reference enumerations from the Rules Glossary.
// These are small, mostly fixed lists (skills, damage types, etc.) that the
// app references by name in many places. Bundling them as content lets us
// dedupe ability mappings, deliver descriptions, and surface them in one place.
// -----------------------------------------------------------------------------

export interface SkillResult extends ContentResult {
  type: 'skill';
  /** Lower-case ability key the skill uses ('strength', 'dexterity', etc.). */
  ability: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  srdVersions: string[];
}

export interface DamageTypeResult extends ContentResult {
  type: 'damage-type';
  /** Coarse category — physical damage vs. typed magical damage. */
  category: 'physical' | 'magical';
  srdVersions: string[];
}

export interface SchoolResult extends ContentResult {
  type: 'school';
  srdVersions: string[];
}

export interface SizeResult extends ContentResult {
  type: 'size';
  /** Footprint on a battle grid, e.g. "5-by-5 ft" for Medium. */
  space: string;
  srdVersions: string[];
}

export interface LanguageResult extends ContentResult {
  type: 'language';
  /** 'standard' (commonly known) or 'rare' (exotic / restricted). */
  rarity: 'standard' | 'rare';
  /** Written script the language uses, or null for spoken-only. */
  script: string | null;
  srdVersions: string[];
}

export interface ActionTypeResult extends ContentResult {
  type: 'action-type';
  /** How many of this action type a creature gets per turn or round. */
  economy: string;
  srdVersions: string[];
}

export interface WeaponPropertyResult extends ContentResult {
  type: 'weapon-property';
  srdVersions: string[];
}

export interface WeaponMasteryResult extends ContentResult {
  type: 'weapon-mastery';
  srdVersions: string[];
}

export interface StandardActionResult extends ContentResult {
  type: 'standard-action';
  /** Which action-economy slot this consumes. */
  actionEconomy: 'action' | 'bonus-action' | 'reaction' | 'free';
  srdVersions: string[];
}

export interface SenseResult extends ContentResult {
  type: 'sense';
  /** Typical creature range in feet, when listed. */
  defaultRange: number | null;
  srdVersions: string[];
}

export interface SpeedResult extends ContentResult {
  type: 'speed';
  srdVersions: string[];
}

export interface CreatureTypeResult extends ContentResult {
  type: 'creature-type';
  srdVersions: string[];
}

export interface AlignmentResult extends ContentResult {
  type: 'alignment';
  /** Moral axis on the alignment grid. */
  morality: 'good' | 'neutral' | 'evil' | 'unaligned';
  /** Ethical axis on the alignment grid. */
  ethics: 'lawful' | 'neutral' | 'chaotic' | 'unaligned';
  srdVersions: string[];
}

export interface CurrencyResult extends ContentResult {
  type: 'currency';
  abbreviation: 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
  /** Conversion factor to copper pieces (cp=1, sp=10, ep=50, gp=100, pp=1000). */
  conversionToCopper: number;
  srdVersions: string[];
}

export interface ToolResult extends ContentResult {
  type: 'tool';
  category: 'artisan' | 'gaming-set' | 'musical-instrument' | 'other';
  /** Cost as { amount, currency }, or null when not commercially listed. */
  cost?: { amount: number; currency: 'cp' | 'sp' | 'ep' | 'gp' | 'pp' } | null;
  weight?: number;
  srdVersions: string[];
}

export interface MagicItemCategoryResult extends ContentResult {
  type: 'magic-item-category';
  srdVersions: string[];
}

export interface CoverResult extends ContentResult {
  type: 'cover';
  /** AC bonus granted to the defender (0 / +2 / +5). */
  acBonus: number;
  /** Whether attacks bypass entirely (total cover). */
  blocksAttacks: boolean;
  srdVersions: string[];
}

export interface ContentQuery {
  search?: string;
  type?: ContentType;
  system?: string;
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
  tiers?: ContentTier[];
  filters?: Record<string, unknown>;
}

export interface SpeciesResult extends ContentResult {
  type: 'species';
  size: 'Small' | 'Medium' | 'Large';
  speed: number;
  traits: Array<{ name: string; description: string }>;
  /** Fixed ASI granted by the species (SRD 5.1 style). Empty for SRD 2.0 species. */
  abilityScoreIncreases: Array<{ ability: string; amount: number }>;
  srdVersions: string[];
}

export interface ClassResult extends ContentResult {
  type: 'class';
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  /** Tool / instrument proficiencies granted by the class. Empty when none. */
  toolProficiencies?: string[];
  skillChoices: { count: number; from: string[] };
  spellcasting: boolean;
  spellcastingAbility: string | null;
  subclassUnlockLevel: number;
  /**
   * Class features granted at each level. May be sparse for seeds — e.g.
   * we ship level 1–5 features for some classes, just level 1 for others.
   */
  features?: Array<{ level: number; name: string; description?: string }>;
  /**
   * Class progression-table column definitions, paired with `progressionTable`
   * rows. Columns are class-specific (Rages / Rage Damage for Barbarian,
   * Sneak Attack dice for Rogue, Spell Slots per level for casters, etc.).
   * Order in the array drives the column order in the UI.
   */
  progressionColumns?: Array<{ key: string; label: string }>;
  /**
   * Per-level rows of the class progression table. Each row's `values`
   * record maps `progressionColumns[].key` to the value for that level.
   * String values let us encode bonuses with a sign ('+2') or non-numeric
   * cells ('—', 'Unlimited'). Numeric values are also accepted.
   */
  progressionTable?: Array<{ level: number; values: Record<string, string | number> }>;
  /**
   * Starting equipment options at character creation. Each option lists
   * concrete items; some options offer a flat gold alternative instead.
   */
  startingEquipment?: Array<{
    label?: string;
    items?: string[];
    gold?: { amount: number; currency: 'cp' | 'sp' | 'ep' | 'gp' | 'pp' };
  }>;
  /** Free-text multiclass prerequisite (e.g. "Strength 13"). */
  multiclassPrerequisite?: string;
  /** Proficiencies gained when multiclassing into this class. */
  multiclassProficiencies?: {
    armor?: string[];
    weapons?: string[];
    tools?: string[];
    savingThrows?: string[];
    skills?: { count: number; from: string[] };
  };
  srdVersions: string[];
}

export interface BackgroundResult extends ContentResult {
  type: 'background';
  skillProficiencies: string[];
  toolProficiency: string | null;
  /** Number of bonus languages granted (0 or more). */
  languages: number;
  /** Ability keys eligible for the +2/+1 or +1/+1/+1 distribution. */
  abilityScoreOptions: string[];
  originFeat: string;
  srdVersions: string[];
}

// -----------------------------------------------------------------------------
// Local content index (full-text search over user-uploaded PDFs)
//
// These types describe the framework that lives on-device only. PDF text is
// extracted on the device, indexed into SQLite FTS5 (native) or IndexedDB
// (web), and NEVER transmitted to the server. See docs/legal.md.
// -----------------------------------------------------------------------------

export type IndexStatus = 'not_indexed' | 'indexing' | 'indexed' | 'failed';

/** One page's worth of text to feed the indexer. */
export interface PageText {
  sourceId: string;
  pageNumber: number;
  text: string;
}

/** Index status + counters for a single uploaded source. */
export interface IndexMeta {
  source_id: string;
  status: IndexStatus;
  pages_indexed: number;
  total_pages: number | null;
  indexed_at: string | null;
  error: string | null;
}

/** A single page-level match from a full-text query. */
export interface LocalContentHit {
  sourceId: string;
  pageNumber: number;
  /** Rendered snippet with match markers (e.g. [word]…) */
  snippet: string;
}
