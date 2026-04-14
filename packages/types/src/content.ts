export type ContentTier = 'srd' | 'local' | 'homebrew';

export type ContentType =
  | 'spell'
  | 'monster'
  | 'item'
  | 'class'
  | 'species'
  | 'feature'
  | 'background'
  | 'feat';

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
  classes: string[];
}

export interface CreatureResult extends ContentResult {
  type: 'monster';
  challengeRating: string | number;
  size: string;
  creatureType: string;
  alignment: string;
  ac: number;
  hp: number;
  speed: string;
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
  skillChoices: { count: number; from: string[] };
  spellcasting: boolean;
  spellcastingAbility: string | null;
  subclassUnlockLevel: number;
  level1Features: Array<{ name: string; description: string }>;
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
