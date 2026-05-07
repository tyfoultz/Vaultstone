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
  | 'species';

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
  /** Free-text speed line: "30 ft., fly 60 ft.". */
  speed: string;
  /** "1/8" | "1/4" | "1/2" | numeric for whole CRs. */
  challengeRating: string;
  /** XP awarded — defaults populated by CR but editable. */
  xp?: number;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  description: string;
  /** Free-form notes for traits / actions until the structured editor lands. */
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
  /** Cost in gold pieces (decimal allowed for cp/sp). 0 / null = no listed price. */
  costGold?: number;
  weight?: number;
  /** Free-form properties list — "Versatile (1d10)", "Disadvantage on Stealth". */
  properties: string[];
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Feat — full schema; matches FeatResult cleanly.
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewFeatData {
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** Free-form prereq line ("Strength 13+", "Level 4+ Fighter"). Empty for none. */
  prerequisites?: string;
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
// Species — basic schema this round. Mirrors SpeciesResult except trait
// name/description pairs become a free-form notes field for now (avoids
// shipping a nested-array editor before the form ergonomics are settled).
// ─────────────────────────────────────────────────────────────────────────
export interface HomebrewSpeciesData {
  size: 'Small' | 'Medium' | 'Large';
  /** Walking speed in feet. */
  speed: number;
  description: string;
  /** Free-form prose: ASI, traits, languages — until structured editor lands. */
  traitsNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Discriminated union for read sites that need to fan out by content type.
// ─────────────────────────────────────────────────────────────────────────
export type HomebrewData =
  | { contentType: 'spell';    data: HomebrewSpellData }
  | { contentType: 'creature'; data: HomebrewCreatureData }
  | { contentType: 'item';     data: HomebrewItemData }
  | { contentType: 'feat';     data: HomebrewFeatData }
  | { contentType: 'class';    data: HomebrewClassData }
  | { contentType: 'species';  data: HomebrewSpeciesData };
