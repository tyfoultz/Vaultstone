export type ContentTier = 'srd' | 'local' | 'homebrew' | 'imported';

/**
 * Where an entry came from beyond its tier. SRD entries leave this undefined;
 * imported entries carry the source-book code their data was tagged with;
 * homebrew entries carry their pack name.
 *
 * `code` is short and shown in compact rows ("PHB"). `name` is the long form
 * shown on detail surfaces ("Player's Handbook"). `page` is included when the
 * source provided one (imported tier almost always; homebrew never).
 */
export interface ImportSource {
  code: string;
  name: string;
  page?: number;
}

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
  | 'optional-feature'
  | 'deity'
  | 'variant-rule'
  | 'condition'
  | 'rule'
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
  /**
   * Provenance for non-SRD tiers — the source-book code for imported content,
   * the pack name for homebrew. Always undefined on SRD entries (their
   * provenance is the system itself). See `ImportSource` for the shape.
   */
  importSource?: ImportSource;
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
  category: 'weapon' | 'armor' | 'shield' | 'adventuring-gear' | 'magic-item';
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
  /**
   * Structured contents for equipment packs (Burglar's Pack, Explorer's
   * Pack, etc.). Each entry is `{ name, quantity }` — the name is the
   * already-resolved display form (e.g. "Candle"), not the slug-with-
   * source reference 5e.tools ships natively. Pluralization at render
   * time. Empty/undefined for non-pack items.
   */
  packContents?: Array<{ name: string; quantity: number }>;
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

/**
 * Optional / variant rule entry — covers two distinct 5e.tools
 * concepts that share a top-level array (`variantrule`):
 *
 *   1. **Glossary** entries (`kind: 'glossary'`) — the 2024 XPHB
 *      compendium of canonical rule terms (Ability Check, Cover,
 *      Damage Roll, Difficult Terrain, etc.). Reference lookups, not
 *      DM toggles. Surfaced under Glossary on the system page.
 *
 *   2. **Variant + Optional rules** (`kind: 'variant' | 'optional'`)
 *      — DM-side opt-in toggles like Flanking, Hero Points, Firearms,
 *      Cleaving. The 2014 DMG concept, kept alive by 5e.tools across
 *      DMG/XGE/TCE/AAG. Surfaced under a "Variants" sub-tab.
 *
 * Both kinds carry the same prose-and-metadata shape; the discriminator
 * just routes them. We don't separate types because most consumers
 * (search, the homebrew resolver, the imported-content row mapper)
 * treat them uniformly.
 */
export interface VariantRuleResult extends ContentResult {
  type: 'variant-rule';
  /** 'glossary' for XPHB compendium entries (ruleType: 'C'),
   *  'variant' for ruleType 'V' / 'VO' (alternative form of an
   *  existing rule), 'optional' for ruleType 'O' (additive new rule),
   *  'other' for entries with no ruleType set. */
  kind: 'glossary' | 'variant' | 'optional' | 'other';
  srdVersions: string[];
}

/**
 * Worshippable deity — used by clerics and paladins choosing a patron
 * during character creation. Mostly flavor metadata; the only field
 * with mechanical impact is `domains[]` (Cleric subclass gating in
 * the 2014 rules; the 2024 rules dropped strict domain-locking, so
 * 2024-sourced entries leave it undefined).
 *
 * `alignment` and `domains` follow the same pattern: present on PHB-
 * era 2014 entries, absent on XDMG 2024 entries (which dropped
 * alignment-as-mechanic). The character builder should treat both as
 * informational.
 */
export interface DeityResult extends ContentResult {
  type: 'deity';
  /** Pantheon grouping — "Greyhawk" (2024 default), "Forgotten Realms",
   *  "Norse", "Greek", "Egyptian", etc. Drives the Pantheon facet on
   *  the catalog page. */
  pantheon: string;
  /** Honorific or domain gloss ("Heart of Oerth", "God of the sea
   *  and storms"). Surfaced as the row sub-line. */
  title?: string;
  /** Single-letter alignment codes 5e.tools ships ("LG", "N", "CE", …).
   *  Empty/undefined for entries that drop alignment (XDMG). */
  alignment?: string[];
  /** Cleric domains the deity grants. Empty/undefined for entries that
   *  don't gate by domain. */
  domains?: string[];
  /** Holy symbol description. Free-form prose. */
  symbol?: string;
  /** Outer plane the deity dwells on. */
  plane?: string;
  /** Free-form worshipers description ("Farmers, herders"). */
  worshipers?: string;
  srdVersions: string[];
}

/**
 * Class-feature choice the player picks during levelling — Eldritch
 * Invocations, Metamagic Options, Battle Master Maneuvers, Fighting
 * Styles, etc. Distinct from FeatResult: these are gated by class
 * features (not ASIs / backgrounds), they often consume a class
 * resource, and they're chosen N-at-a-time as the unlocking class
 * feature progresses. The character builder will need a per-feature
 * picker keyed on `kind`.
 */
export interface OptionalFeatureResult extends ContentResult {
  type: 'optional-feature';
  /**
   * Canonical kind buckets, derived from 5e.tools `featureType[]` codes.
   * Multi-kind entries (e.g. a Fighting Style available to Fighter +
   * Paladin + Ranger) carry every applicable kind so per-class pickers
   * can filter without double-walking the list.
   */
  kinds: OptionalFeatureKind[];
  /**
   * Free-form rendered prerequisite line (e.g. "Warlock 2, a Warlock
   * cantrip that deals damage"). Empty string when there's no
   * prerequisite. Detail-page surfaces render this verbatim; pickers
   * use the structured raw shape on `data.prerequisitesRaw` for gating
   * logic.
   */
  prerequisites?: string;
  /**
   * Class resource the feature consumes per use, when applicable —
   * "Sorcery Point" for metamagic, "Superiority Die" for maneuvers.
   * Undefined for at-will features (most invocations, fighting styles).
   */
  consumes?: string;
  srdVersions: string[];
}

/**
 * Optional-feature kind discriminator. Mirrors the slice of 5e.tools
 * featureType codes that correspond to choices a player makes during
 * character creation or levelling. Codes outside this list (`O`,
 * `RP`, `RN`, `AS`, `ED`, etc.) collapse into 'other' so the catalog
 * still surfaces them without proliferating buckets.
 */
export type OptionalFeatureKind =
  | 'invocation'        // EI — Warlock Eldritch Invocation
  | 'metamagic'         // MM — Sorcerer Metamagic Option
  | 'maneuver'          // MV:B — Battle Master Maneuver
  | 'fighting-style'    // FS:F / FS:P / FS:R / FS:B — multi-class fighting styles
  | 'pact-boon'         // PB — Pre-2024 Warlock Pact Boon (2024 collapsed these into EI)
  | 'artificer-infusion' // AI — Artificer Infusion
  | 'arcane-shot'       // AS — Arcane Archer Arcane Shot
  | 'elemental-discipline' // ED — Way of Four Elements monk discipline
  | 'rune'              // RN — Rune Knight rune
  | 'other';

export interface RuleResult extends ContentResult {
  type: 'rule';
  /** Top-level chapter this section belongs to, e.g. "Combat", "Resting". */
  chapter: string;
  /** Display order within the chapter (Open5e's per-section index). */
  order: number;
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
  /**
   * Which ability score the tool's proficiency check uses (2024 SRD
   * standardized this — Alchemist's Supplies → Intelligence, Bagpipes
   * → Charisma, Thieves' Tools → Dexterity, etc.). 5.1 SRD entries
   * leave this undefined since the older rules didn't fix an ability
   * per tool.
   */
  ability?: string;
  /**
   * Quick-reference utilize options the 2024 SRD lists for the tool —
   * each one is a (DC + outcome) bullet (e.g. "Identify a substance
   * (DC 15)"). Empty / undefined when the source doesn't ship them.
   */
  utilize?: string[];
  /**
   * Items the tool can craft, by display name. Matches the 2024 SRD
   * "Craft" field on artisan tools. The character builder will use
   * this for tool-driven crafting suggestions; for now the system
   * page just renders the comma-separated list.
   */
  craft?: string[];
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
  /**
   * Scope homebrew results to packs enabled for this campaign. Only affects
   * the homebrew tier — SRD/local content ignores it. When set, the homebrew
   * resolver returns entries only from packs whose row in `campaign_packs`
   * has `enabled = true` for the given campaign. When undefined, all of the
   * authenticated user's accessible homebrew is returned (existing behavior).
   */
  campaignId?: string;
  /**
   * Scope homebrew results to a specific list of pack ids. Mutually exclusive
   * with `campaignId` — pass one or the other, not both. Used by the
   * standalone-character flow where the user explicitly opts into a subset
   * of their personal homebrew library at character creation time. An empty
   * array short-circuits the homebrew tier (no packs → no homebrew).
   */
  packIds?: string[];
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
   * All class levels at which the chosen subclass grants a feature
   * (sorted ascending). For 5e classes this is typically the unlock level
   * plus a handful of follow-up levels (Barbarian: 3, 6, 10, 14;
   * Fighter: 3, 7, 10, 15, 18). The class table renders "Subclass
   * feature" at each of these levels so the row isn't blank when the
   * actual feature lives in the chosen subclass.
   */
  subclassFeatureLevels?: number[];
  /**
   * Class features granted at each level. May be sparse for seeds — e.g.
   * we ship level 1–5 features for some classes, just level 1 for others.
   *
   * `parentName` (optional) flags this feature as a sub-option of
   * another feature at the same level (e.g. Cleric's "Protector" /
   * "Thaumaturge" are sub-options of "Divine Order"). Renderers indent
   * children under the parent and slot them immediately after it.
   */
  features?: Array<{ level: number; name: string; description?: string; parentName?: string }>;
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
    /** Either a fixed amount (2024-style "15 GP") or a dice
     *  expression (5.1-style "2d4 × 10 gp"). Dice expressions are
     *  surfaced verbatim — the UI renders them as "Roll 2d4 × 10
     *  gp" rather than evaluating to a fixed value. */
    gold?: {
      amount?: number;
      dice?: string;
      currency: 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
    };
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
  /**
   * Starting equipment as a single human-readable string. 2024-edition
   * backgrounds typically frame this as "Choose A or B: (A) … or (B) 50 GP";
   * 2014-edition backgrounds list the gear directly. `null` when the source
   * doesn't surface it (e.g. SRD 5.1 entries, which lack a structured
   * equipment benefit).
   */
  startingEquipment: string | null;
  srdVersions: string[];
}

