// Character Builder Options — structured shapes that drive the
// character creation wizard's pickers and the campaign rule
// enforcement gates. Lives separate from `content.ts` so consumers
// (the wizard, the character sheet, the system detail page) can
// import only what they need without pulling the rest of the
// content-result definitions.
//
// The data sources for these shapes split three ways:
//
//   1. Bundled SRD content. Open5e's per-content-type snapshots already
//      ship enough information for some fields (feat prereq prose, class
//      feature names per level). Transforms in `packages/content/src/srd`
//      lift the prose into the structured shapes here.
//
//   2. Hand-curated tables. Multiclass ability minimums and the 2014/2024
//      ASI-swap rules are not in Open5e's schema; they live in small
//      static tables in `packages/systems/src/dnd5e`.
//
//   3. Homebrew-authored content. Pack authors fill in the structured
//      shape directly via the homebrew authoring forms; their entries
//      land in `imported_content` alongside SRD entries and are merged
//      by the resolver.

// ── Feat prerequisites ───────────────────────────────────────────────────

/**
 * Structured feat prerequisite. A feat may carry zero or more of
 * these clauses; all clauses must be satisfied (AND) for the feat to
 * be selectable. The prose form lives separately on the feat's
 * `prerequisites` field for display; this shape is what the wizard
 * + character sheet check against the actual character state.
 *
 * Prose-only prereqs that don't fit the structured taxonomy fall
 * through with `kind: 'prose'` so the player still sees the
 * requirement and the gate stays informational rather than
 * disappearing entirely.
 */
export type FeatPrerequisite =
  | FeatPrereqAbilityScore
  | FeatPrereqCharacterLevel
  | FeatPrereqClassFeature
  | FeatPrereqProse;

/**
 * One ability must meet a minimum score. When `abilities[]` has more
 * than one entry, the clause is satisfied if *any* of the listed
 * abilities meets the threshold (e.g. "Strength or Dexterity 13+"
 * satisfies on either).
 */
export interface FeatPrereqAbilityScore {
  kind: 'ability-score';
  abilities: AbilityKey[];
  minimum: number;
}

/** The character's overall level must meet `minimum`. */
export interface FeatPrereqCharacterLevel {
  kind: 'character-level';
  minimum: number;
}

/**
 * The character must have access to a named class feature. Encodes
 * "Fighting Style Feature", "Spellcasting Feature", etc. The matcher
 * checks whether any class on the character grants a feature whose
 * name matches `featureName` (case-insensitive). Subclass-granted
 * features count.
 */
export interface FeatPrereqClassFeature {
  kind: 'class-feature';
  featureName: string;
}

/**
 * Fallback for prereqs that don't fit any structured kind.
 * Surfaced verbatim; not enforceable. The feat's parent
 * `prerequisites` prose already covers the display, so this is only
 * used when authors want to flag a non-structured rule explicitly.
 */
export interface FeatPrereqProse {
  kind: 'prose';
  text: string;
}

export type AbilityKey =
  | 'strength' | 'dexterity' | 'constitution'
  | 'intelligence' | 'wisdom' | 'charisma';

// ── Multiclass prerequisites ─────────────────────────────────────────────

/**
 * Multiclass prerequisites for a single class — the ability-score
 * minimums a character must meet to add this class as a second (or
 * later) class. Per the 2014/2024 SRD, most classes require a single
 * 13 in their primary ability; some require 13 in two (Fighter:
 * Strength OR Dexterity, Paladin: Strength AND Charisma, etc.).
 *
 * The shape models AND-of-OR-groups: every group must be satisfied,
 * and a group is satisfied if *any* of its abilities meets `minimum`.
 *
 * Examples:
 *   Barbarian (5.1): [{ abilities: ['strength'], minimum: 13 }]
 *   Fighter   (5.1): [{ abilities: ['strength', 'dexterity'], minimum: 13 }]
 *     — STR 13 OR DEX 13 satisfies the single group.
 *   Paladin   (5.1): [
 *     { abilities: ['strength'], minimum: 13 },
 *     { abilities: ['charisma'], minimum: 13 },
 *   ]
 *     — both groups must be satisfied: STR 13 AND CHA 13.
 *
 * Lookups are keyed by class key (matches `ClassResult.key`,
 * edition-suffixed). Classes absent from the table have no
 * multiclass prerequisite (the catch-all "no prereq" default).
 */
export interface MulticlassPrereq {
  abilities: AbilityKey[];
  minimum: number;
}

export type MulticlassPrereqTable = Record<string, MulticlassPrereq[]>;

// ── Optional class features ──────────────────────────────────────────────

/**
 * A class feature variant — a Tasha's-style alternate that replaces
 * or augments a base class feature when the campaign rule
 * `optional_class_features` is enabled. Distinct from
 * `ClassResult.features[]` (which is the always-on base list); this
 * shape lives separately so the wizard can render two columns
 * (base + optional) and apply the campaign-rule filter cleanly.
 *
 * The 5.1 + 5.2 SRDs do not ship Tasha's content, so this catalog
 * lands empty for bundled systems. Pack authors populate it via the
 * homebrew authoring form. Schema is stable so future SRD updates
 * (or licensed pack imports) can drop in without re-shaping.
 */
export interface OptionalClassFeature {
  /** Stable key — slug form, edition-suffixed. */
  key: string;
  /** The class this variant belongs to (matches `ClassResult.key`). */
  classKey: string;
  /** Class level at which the variant is available. */
  level: number;
  /** Display name shown in the picker. */
  name: string;
  /** Prose description. */
  description: string;
  /**
   * The base feature this variant replaces, by name. Empty when the
   * variant is purely additive (most fighting-style alternates).
   * Renderers strike-through the replaced base feature when present.
   */
  replaces?: string;
  /**
   * Provenance label shown in the picker — "Tasha's Cauldron of
   * Everything", "Homebrew", etc. Free-form so pack authors can
   * label their own collections.
   */
  source?: string;
}

// ── Species origin swap rules ────────────────────────────────────────────

/**
 * What parts of a species' starting kit a player may freely swap
 * during character creation when the campaign rule
 * `customize_origin` is enabled.
 *
 * The 2014 SRD locks species ASIs / languages / proficiencies to the
 * species' defaults; Tasha's introduced the swap as an opt-in. The
 * 2024 SRD made swapping the default — every 2024 species ships
 * without a fixed ASI at all (the player picks their +2/+1
 * distribution against the full ability list).
 *
 * This shape models per-species swap permissions for the wizard's
 * Customize Origin UI. When `customize_origin` is OFF, the wizard
 * locks every choice to the species' bundled defaults. When ON, it
 * surfaces a swap picker for each `true` flag.
 *
 * 2014 species default to all-false; 2024 species default to all-true
 * (and effectively ignore the rule since their bundled defaults
 * already encode "swap freely"). Homebrew species pick per-flag.
 */
export interface SpeciesSwapRules {
  /**
   * Whether the player may reassign the species' fixed ASI to other
   * abilities of their choice. False on 2014 species; true on 2024
   * species (which ship with no fixed ASI to begin with).
   */
  abilityScores: boolean;
  /**
   * Whether granted languages may be swapped for languages of the
   * player's choice. The number of languages is unchanged — only
   * which languages are picked.
   */
  languages: boolean;
  /**
   * Whether granted skill proficiencies may be swapped for skills of
   * the player's choice. The number is unchanged.
   */
  skills: boolean;
}
