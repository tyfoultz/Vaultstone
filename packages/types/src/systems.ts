export type ResourceRecharge = 'short_rest' | 'long_rest' | 'daily' | 'per_scene';

export interface ResourcePool {
  key: string;
  label: string;
  max: number | null; // null = derived from character level/class
  recharge: ResourceRecharge;
}

export interface AttributeDefinition {
  key: string;
  label: string;
  type: 'number' | 'string' | 'enum';
  options?: string[]; // for enum types
  derivedFrom?: string; // e.g. 'strength' for 'strength_modifier'
  derivation?: 'modifier_5e'; // known derivation functions
}

export interface CreationStep {
  key: string;
  label: string;
  contentCollection: string; // which ContentResolver collection to query for options
  required: boolean;
}

/**
 * A rules-variant the system supports — equivalent of D&D Beyond's
 * "Optional Features". Each entry declares an opt-in / opt-out toggle
 * (or multi-choice picker) that the DM (campaign scope) or player
 * (character scope) can flip. The system definition only declares
 * *what's available*; the actual on/off state lives on
 * `campaign_settings` (campaign-scoped rules) or `character_settings`
 * (character-scoped rules), neither of which is built yet.
 *
 * Distinct from `CreationStep` — creation steps are wizard pages
 * (pick a class), optional rules are knobs that change the rules
 * applied during play (Customize Your Origin, fixed-vs-rolled HP).
 */
export interface OptionalRule {
  /** Stable id, e.g. 'customize_origin', 'hit_point_method'. */
  key: string;
  /** Short user-facing label. */
  label: string;
  /** One-sentence explanation of what flipping this rule does. */
  description: string;
  /**
   * Where this rule's state is stored. `'campaign'` rules are flipped
   * by the DM and apply uniformly across the campaign's characters;
   * `'character'` rules are flipped by the player during character
   * creation or on the sheet. The character-creation wizard surfaces
   * both — character-scope rules as questions to the player,
   * campaign-scope rules as read-only hints from the DM's config.
   */
  scope: 'campaign' | 'character';
  /**
   * Discriminator describing the shape of the rule's state value.
   *   - 'boolean' — a simple on/off toggle. `default` is true/false.
   *   - 'choice'  — pick one from `choices[]`. `default` is one of
   *                 the choice keys.
   */
  type: 'boolean' | 'choice';
  /** Default state when the campaign / character hasn't set the rule. */
  default: boolean | string;
  /** Required when type === 'choice'. Each entry is { key, label }. */
  choices?: Array<{ key: string; label: string }>;
}

export interface SheetSection {
  key: string;
  label: string;
  order: number;
}

/**
 * Which bundled SRD revision this system pulls its baseline content from.
 * `null` means the system has no SRD-tagged content (Custom, future homebrew systems).
 */
export type SrdVersion = 'SRD_5.1' | 'SRD_2.0';

export interface GameSystemDefinition {
  id: string;
  displayName: string;
  version: string;
  license: string;
  isBundled: boolean;
  /**
   * Filters which bundled SRD records this system surfaces. SRD items carry
   * `srdVersions: SrdVersion[]`; a system with `srdVersion: 'SRD_5.1'` only
   * shows items whose `srdVersions` array includes 'SRD_5.1'. `null` skips
   * SRD filtering entirely (e.g. Custom).
   */
  srdVersion: SrdVersion | null;
  attributes: AttributeDefinition[];
  resourcePools: ResourcePool[];
  creationSteps: CreationStep[];
  /**
   * Rules-variants the system supports — DM and player toggles like
   * Customize Your Origin, fixed-vs-rolled HP, multiclass prerequisite
   * enforcement. Empty array when the system doesn't surface any
   * (e.g. the Custom system, where the user defines their own rules
   * outside this schema).
   */
  optionalRules: OptionalRule[];
  sheetSections: SheetSection[];
}
