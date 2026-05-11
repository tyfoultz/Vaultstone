// Homebrew authoring data shapes — what the user actually fills in via the
// pack-detail authoring forms. These shapes live in the `data` jsonb column
// of `homebrew_content` rows. The ContentResolver later wraps them into the
// matching `*Result` shape (SpellResult, CreatureResult, etc.) by joining
// pack metadata (`tier: 'homebrew'`, `system`, etc.) at read time.
//
// Why a subset of the SRD `*Result` types: SRD entries carry version + key
// + tier metadata that's mechanical to derive at read time. Asking the
// authoring form to enter those would be both redundant and wrong (the
// user can't author "what SRD version did this come from?"). So the data
// schema captures only the *user-authored* fields.
//
// `HomebrewContentType` is the discriminator. The `homebrew_content.data`
// column stores one of these shapes; the matching `content_type` text
// column on the row tells us which one to deserialize as.

export type HomebrewContentType =
  | 'spell'
  | 'creature'
  | 'item'
  | 'feat'
  | 'class'
  | 'species'
  | 'background'
  | 'subclass'
  | 'optional-feature'
  | 'deity'
  | 'condition';

// ─────────────────────────────────────────────────────────────────────────
// Spell — full schema, everything the SRD spell view renders.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewSpellData {
  /** 0–9 (0 = cantrip). */
  level: number;
  school: string;
  castingTime: string;
  range: string;
  /** Components selected: 'V', 'S', 'M' — material text in `materialComponents` if M. */
  components: Array<'V' | 'S' | 'M'>;
  /** Free-form text for the M component (e.g. "a pinch of bat guano"). Empty when M not selected. */
  materialComponents?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  /** "At Higher Levels" / "Using a Higher-Level Spell Slot" prose. Empty when none. */
  higherLevels?: string;
  /** Class names that can prepare/learn this spell. */
  classes: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Creature — basic schema this round. Full stat blocks (multi-action arrays,
// per-skill bonuses, legendary/lair actions) live behind a "more fields"
// follow-up; users can express the core mechanics today.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewCreatureData {
  /** "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan". */
  size: string;
  /** "Aberration", "Beast (canine)", "Humanoid (goblinoid)" — free text. */
  creatureType: string;
  alignment: string;
  ac: number;
  /** "natural armor", "leather armor, shield" — free text. */
  armorDetail?: string;
  hp: number;
  /** "12d8 + 36" — free text expression. */
  hitDice?: string;
  /** Free-text speed line: "30 ft., fly 60 ft.". Kept for legacy rows
   *  and as a display fallback when `speeds` is empty. New entries
   *  should populate `speeds` instead — the resolver synthesizes the
   *  display string from it when present. */
  speed: string;
  /** Structured per-mode speeds in feet. `hover` is a boolean flag on
   *  fliers; only set it when the creature hovers (Beholder, etc.). */
  speeds?: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
  /** "1/8" | "1/4" | "1/2" | numeric for whole CRs. */
  challengeRating: string;
  /** XP awarded — defaults populated by CR but editable. */
  xp?: number;
  /** Proficiency bonus. When omitted the resolver derives it from CR
   *  (CR 0-4 → +2, 5-8 → +3, …). Override for outliers. */
  proficiencyBonus?: number;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  /** Proficient saving throws. Keyed by ability — the value is the
   *  final bonus the renderer shows ("Save: STR +5"). Authors enter
   *  the total here directly; we don't auto-derive from prof bonus
   *  because some creatures get bespoke bonuses. */
  savingThrows?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>;
  /** Proficient skills — { skillKey: total bonus }. Snake_case skill keys
   *  to match the canonical 5e list. */
  skills?: Record<string, number>;
  /** Special senses in feet. `passivePerception` overrides the
   *  derived value when present. */
  senses?: {
    darkvision?: number;
    blindsight?: number;
    tremorsense?: number;
    truesight?: number;
    passivePerception?: number;
  };
  /** Free-text languages line ("Common, Draconic", "understands Common
   *  but can't speak"). */
  languages?: string;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  /** Always-on traits ("Pack Tactics", "Magic Resistance"). */
  traits?: Array<{ name: string; description: string }>;
  /** Activated abilities. `actionType` discriminates Action vs Bonus
   *  Action vs Reaction vs Legendary Action — matches the
   *  CreatureResult shape. */
  actions?: Array<{ name: string; description: string; actionType?: string }>;
  /** Environment tags ("forest", "underdark", "arctic"). */
  environments?: string[];
  description: string;
  /** Legacy free-form notes from pre-structured rows. The resolver
   *  surfaces it as a single fallback trait when `traits` is empty. */
  traitsNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Item — covers mundane and magic items. Flat shape; magic-item kind goes
// inside `magicItemKind` for category='magic-item'.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewItemData {
  category: 'weapon' | 'armor' | 'shield' | 'adventuring-gear' | 'magic-item';
  /** Sub-category for magic items: wand, ring, potion, scroll, wondrous-item, etc. */
  magicItemKind?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';
  requiresAttunement: boolean;
  /** "by a wizard", "by a creature of evil alignment". Empty when no specific prereq. */
  attunementCondition?: string;
  /** Structured cost — matches ItemResult.cost exactly, so the
   *  resolver passes it through unchanged. Undefined / null means
   *  no listed price. */
  cost?: { amount: number; currency: 'cp' | 'sp' | 'ep' | 'gp' | 'pp' };
  /** Legacy cost-in-gp field. The resolver falls back to this when
   *  `cost` is missing; the form never writes new values to it. */
  costGold?: number;
  weight?: number;
  /** Free-form properties list — "Versatile (1d10)", "Disadvantage on Stealth". */
  properties: string[];
  /** Structured contents for equipment packs (Burglar's Pack,
   *  Explorer's Pack, etc.). Each entry is `{ name, quantity }` where
   *  `name` is the already-resolved display form (e.g. "Candle"). */
  packContents?: Array<{ name: string; quantity: number }>;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Feat — full schema; matches FeatResult cleanly.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewFeatData {
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** Free-form prereq line ("Strength 13+", "Level 4+ Fighter"). Empty for none. */
  prerequisites?: string;
  /**
   * Structured prereq clauses — all must be satisfied (AND). When
   * present alongside the prose form, the wizard's prereq checker
   * uses these for gating; the prose stays the canonical display.
   * The authoring form lets users build the structured shape via a
   * composite editor; the resolver mirrors `prerequisitesRaw` onto
   * the corresponding `FeatResult.prerequisitesRaw` field.
   */
  prerequisitesRaw?: import('./character-builder').FeatPrerequisite[];
  /** Bullet-form benefits. */
  benefits: string[];
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Class — basic schema this round. Per-level features and progression
// tables are deferred to a follow-up structured editor (the SRD class
// schema has 20 levels and per-class table columns, which is its own UI
// problem). Today users author core traits + free-text features.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewClassData {
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: { count: number; from: string[] };
  spellcasting: boolean;
  spellcastingAbility: string | null;
  subclassUnlockLevel: number;
  description: string;
  /** Free-form per-level features prose until the structured editor lands. */
  featuresNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Species — mirrors SpeciesResult so authored entries get the same
// downstream treatment as SRD species. Traits are a structured list of
// {name, description} pairs (rendered as named blocks on the species
// detail card + character sheet), ASIs split into fixed and choice
// clauses (Half-Elf "+1 to two of your choice" is a choice clause),
// and swapRules opt the species into Custom Origin's player-choice ASI
// allocator on the character creation wizard.
//
// `traitsNotes` is preserved for pre-structured rows — the resolver
// surfaces it as a single fallback trait when `traits` is empty.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewSpeciesData {
  size: 'Small' | 'Medium' | 'Large';
  /** Walking speed in feet. */
  speed: number;
  description: string;
  /** Named feature blocks ("Darkvision", "Fey Ancestry"). Rendered
   *  as a bullet list on the detail card.
   *
   *  - `level` is the character level at which the trait unlocks —
   *    defaults to 1 when omitted.
   *  - `options` turns a trait into a "pick one" group. When present
   *    and non-empty, the wizard surfaces a picker; `description` acts
   *    as the lead-in prose, then each option renders as a sub-bullet.
   *    Selection wiring on the character draft is a follow-up; today
   *    the form authors them and renderers display them read-only. */
  traits: Array<{
    name: string;
    description: string;
    level?: number;
    options?: Array<{ name: string; description: string }>;
  }>;
  /** Fixed ability score bonuses (Dwarf +2 CON style). Empty for
   *  Custom-Origin species that let the player pick on the wizard. */
  abilityScoreIncreases: Array<{ ability: string; amount: number }>;
  /** Player-choice ASI clauses ("+1 to two abilities of your choice"
   *  Half-Elf style). Optional. */
  abilityScoreChoices?: Array<{ count: number; amount: number; from: string[] }>;
  /** Languages granted to every member of the species. Free-text so
   *  homebrew can reference languages outside the SRD catalog. Empty
   *  when the species grants no fixed languages. */
  languagesFixed?: string[];
  /** Player-choice language clauses ("Choose one extra language"). Each
   *  entry says "pick `count` languages from `from` (or 'any')". Empty
   *  / undefined when the species has no language choice. */
  languagesChoices?: Array<{ count: number; from: string[] | 'any' }>;
  /** Per-species permissions for the wizard's Customize Origin step.
   *  Defaults to all-false (locked to fixed bonuses) when omitted —
   *  authored species opt into Custom Origin explicitly. */
  swapRules?: {
    abilityScores?: boolean;
    languages?: boolean;
    skills?: boolean;
  };
  /** Legacy free-form notes from pre-structured rows. The resolver
   *  surfaces it as a single fallback trait when `traits` is empty. */
  traitsNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Background — character-creation field. Mirrors BackgroundResult except
// `features` (the canonical background-shipped feature with name +
// description) collapses to a single free-form description field for
// the authoring pass. Once we ship a richer feature editor it can move
// to a structured shape.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewBackgroundData {
  skillProficiencies: string[];
  toolProficiency: string | null;
  /** Bonus languages granted at creation (count, not names — picker
   *  lives in the character creation wizard). 0 = none. */
  languages: number;
  /**
   * Ability keys eligible for the 2024 +2/+1 distribution. Used by
   * the wizard's Ability Scores step when CYO is off. Empty for
   * 5.1-style backgrounds that grant no ASI.
   */
  abilityScoreOptions: string[];
  /** Origin feat name granted automatically (2024 style). Empty for
   *  5.1-style backgrounds. */
  originFeat: string;
  /**
   * Starting equipment. Two-shape union for backwards compatibility:
   *  - `StartingEquipmentEntry[]` is the structured form (added with
   *    the resolver/wizard-grants-inventory work). Authoring should
   *    produce this shape going forward.
   *  - `string | null` is the legacy freeform paragraph — older
   *    homebrew rows in the DB still carry it; the resolver promotes
   *    it onto `BackgroundResult.startingEquipmentText` for display.
   */
  startingEquipment: import('./content').StartingEquipmentEntry[] | string | null;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Subclass — paired with HomebrewClass. parentClassKey points at the
// class (homebrew or SRD) the subclass branches from; the class detail
// page filters its subclass list on this key. Features collapse to a
// free-form notes field for now, same posture as HomebrewClass.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewSubclassData {
  /** Exact ClassResult.key the subclass attaches to. Edition-suffixed
   *  for SRD classes ("barbarian-srd-2-0"); raw key for homebrew
   *  classes. The wizard filters subclasses by this. */
  parentClassKey: string;
  /** Display-only name for the parent class ("Barbarian", "Wizard"). */
  parentClassName?: string;
  /** Level at which the subclass unlocks. 3 in 2024, varies in 5.1. */
  unlockLevel: number;
  description: string;
  /** Class abilities granted by the subclass at specific levels. Mirrors
   *  SubclassResult.features exactly — the resolver passes it through. */
  features?: Array<{ level: number; name: string; description: string }>;
  /** Legacy free-form prose from pre-structured rows. The resolver
   *  synthesizes a single fallback feature when `features` is empty. */
  featuresNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Optional Feature — Eldritch Invocations, Metamagic Options, Battle
// Master Maneuvers, Fighting Styles, Artificer Infusions, etc. Class-
// gated choices that aren't ASI feats. The `kinds` array carries the
// taxonomy buckets the SRD ships (one entry can belong to multiple,
// e.g. a Fighting Style for both Fighter and Paladin).
// ─────────────────────────────────────────────────────────────────────────
export type HomebrewOptionalFeatureKind =
  | 'invocation'
  | 'metamagic'
  | 'maneuver'
  | 'fighting-style'
  | 'pact-boon'
  | 'artificer-infusion'
  | 'arcane-shot'
  | 'elemental-discipline'
  | 'rune'
  | 'class-feature-variant'
  | 'other';

export interface HomebrewOptionalFeatureData {
  kinds: HomebrewOptionalFeatureKind[];
  /** Display-form prereq line ("Warlock 2; a Warlock cantrip"). */
  prerequisites?: string;
  /** Class resource the feature consumes per use ("Sorcery Point",
   *  "Superiority Die"). Undefined for at-will entries. */
  consumes?: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Deity — Cleric/Paladin patrons. Mostly flavor; mechanically only the
// optional `domains[]` field matters (2014 Cleric subclass gating).
// 2024 dropped domain locks, so 2024-flavor deities can leave `domains`
// empty.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewDeityData {
  pantheon: string;
  /** Honorific or domain gloss ("God of the sea and storms"). */
  title?: string;
  /** Alignment letter codes (LG, N, CE, …). Empty when omitted. */
  alignment?: string[];
  /** Cleric domains the deity grants. Empty for alignment-only deities. */
  domains?: string[];
  symbol?: string;
  plane?: string;
  worshipers?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Condition — a homebrew status effect that surfaces in the character
// sheet's condition picker alongside SRD conditions. Effects render as
// rule bullets in the description popover.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewConditionData {
  /** One bullet per mechanical effect. */
  effects: string[];
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Discriminated union for read sites that need to fan out by content type.
// ─────────────────────────────────────────────────────────────────────────
export type HomebrewData =
  | { contentType: 'spell';            data: HomebrewSpellData }
  | { contentType: 'creature';         data: HomebrewCreatureData }
  | { contentType: 'item';             data: HomebrewItemData }
  | { contentType: 'feat';             data: HomebrewFeatData }
  | { contentType: 'class';            data: HomebrewClassData }
  | { contentType: 'species';          data: HomebrewSpeciesData }
  | { contentType: 'background';       data: HomebrewBackgroundData }
  | { contentType: 'subclass';         data: HomebrewSubclassData }
  | { contentType: 'optional-feature'; data: HomebrewOptionalFeatureData }
  | { contentType: 'deity';            data: HomebrewDeityData }
  | { contentType: 'condition';        data: HomebrewConditionData };
