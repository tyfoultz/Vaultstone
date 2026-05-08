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
  /** Stable wizard-step key. The wizard's renderStep dispatch matches
   *  on this exact value, so changes here ripple through the wizard. */
  key: string;
  /** Header label shown on the step. */
  label: string;
  /**
   * Which ContentResolver collection to query for options. Empty
   * string for steps that don't read from the resolver (e.g. ability
   * scores, name + review). The wizard doesn't use this directly
   * yet — picker steps each call ContentResolver themselves with
   * the appropriate type — but it's preserved so the read-only
   * Schema view on the system detail page can surface it.
   */
  contentCollection: string;
  /**
   * Whether finishing the wizard requires the player to commit a
   * value at this step. Required steps gate the Continue button via
   * the wizard's `isStepComplete` check.
   */
  required: boolean;
  /**
   * Whether this step participates in the campaign-launched flow.
   * Steps with `inCampaign: false` (e.g. `'ruleset'`) are skipped
   * when the wizard is launched with `?campaignId=` since the
   * campaign already locks the system + content packs.
   */
  inCampaign?: boolean;
  /**
   * Optional rule key that gates the step's existence. When set, the
   * wizard only renders the step if the resolved rule value is
   * truthy (campaign-launched: from the campaign's rules bag;
   * standalone: from the system's bundled default). Used today by
   * the L1 Feats step (`'feats_at_level_1'`).
   */
  gatedByRule?: string;
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
   *   - 'number'  — bounded integer. `default` is a number; `min`
   *                 and `max` define the inclusive range; `step`
   *                 controls increments (defaults to 1). Used for
   *                 things like "starting level" where the value
   *                 is a count, not a category.
   */
  type: 'boolean' | 'choice' | 'number';
  /** Default state when the campaign / character hasn't set the rule. */
  default: boolean | string | number;
  /** Required when type === 'choice'. Each entry is { key, label }. */
  choices?: Array<{ key: string; label: string }>;
  /** Required when type === 'number'. Inclusive lower bound. */
  min?: number;
  /** Required when type === 'number'. Inclusive upper bound. */
  max?: number;
  /** Optional when type === 'number'. Increment step (default 1). */
  step?: number;
  /**
   * Optional parent rule key. When set, this rule renders as a sub-
   * item under its parent's row (indented + visually grouped) and is
   * hidden when the parent's value matches `parentHiddenWhen`. Used
   * for rules that only make sense in the context of another rule
   * (e.g. "Ignore Coin Weight" is irrelevant when Encumbrance is
   * Disabled). The bag still stores both keys independently — the
   * parent relationship is purely a presentation hint.
   */
  parentKey?: string;
  /**
   * When the parent's value equals (or is included in) this, the
   * sub-rule is hidden. Single-value compare for boolean parents;
   * array for choice parents (e.g. hide when 'disabled' is chosen).
   */
  parentHiddenWhen?: boolean | string | Array<boolean | string>;
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
