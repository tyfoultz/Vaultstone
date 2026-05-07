// Rules-variants the 5e system supports — equivalent of D&D Beyond's
// "Optional Features" panel. The DM toggles `scope: 'campaign'`
// rules to shape the campaign's ruleset; players answer
// `scope: 'character'` rules during character creation or on the
// sheet. Both are read by the wizard / sheet at runtime; this file
// just declares what knobs exist.
//
// Edition split: most rules apply to both 2014 and 2024, but defaults
// can diverge (e.g. Customize Your Origin shipped as opt-in in
// Tasha's, became default-on in 2024). When a rule needs different
// defaults per edition, build a small wrapper in dnd5e/index.ts that
// overrides the relevant entries — for v1 we ship one shared list
// with the more permissive defaults (closer to 2024's posture) since
// that matches the system most users are creating today.

import type { OptionalRule } from '@vaultstone/types';

export const optionalRules: OptionalRule[] = [
  // ── Campaign-scoped rules — DM picks once for the whole table ───────────
  {
    key: 'starting_level',
    label: 'Starting Level',
    description:
      'Level new characters begin at when joining this campaign. Most campaigns start at 1; higher values are useful for one-shots or campaigns continuing an existing arc.',
    scope: 'campaign',
    type: 'number',
    default: 1,
    min: 1,
    max: 20,
  },
  {
    key: 'customize_origin',
    label: 'Customize Your Origin',
    description:
      "Allow players to swap species ability bonuses, languages, and skill proficiencies during character creation. Default behavior in the 2024 rules; an optional rule from Tasha's Cauldron in the 2014 rules.",
    scope: 'campaign',
    type: 'boolean',
    default: true,
  },
  {
    key: 'optional_class_features',
    label: 'Optional Class Features',
    description:
      "Allow class features published in supplements (Tasha's Cauldron, etc.) that replace or augment the base class feature list — Pact of the Talisman, alternate Fighting Styles, Optional Spell Lists, and so on.",
    scope: 'campaign',
    type: 'boolean',
    default: true,
  },
  {
    key: 'enforce_feat_prerequisites',
    label: 'Enforce Feat Prerequisites',
    description:
      'Gate feat selection on each feat\'s declared prerequisites (ability score minimums, class membership, spell access). Disable to let players take any feat regardless of prerequisites.',
    scope: 'campaign',
    type: 'boolean',
    default: true,
  },
  {
    key: 'multiclassing',
    label: 'Multiclassing',
    description:
      "Whether players can take levels in more than one class. Enforced (default) requires the published ability score minimums (e.g. Strength 13 to multiclass into Fighter). Relaxed allows multiclassing but waives the prereqs — the more permissive 2014 variant. Disabled removes multiclassing entirely; characters stay single-class.",
    scope: 'campaign',
    type: 'choice',
    default: 'enforced',
    choices: [
      // "Allowed" prefix on the on-states groups them visually as
      // sub-modes of "multiclassing is on" while Disabled stands
      // alone. Description above explains what each variant does.
      { key: 'enforced', label: 'Allowed - Enforced' },
      { key: 'relaxed',  label: 'Allowed - Relaxed' },
      { key: 'disabled', label: 'Disabled' },
    ],
  },
  {
    key: 'advancement_type',
    label: 'Advancement',
    description:
      'How characters gain levels. XP-based tracks experience awards from encounters; milestone-based levels the party at story beats the DM declares.',
    scope: 'campaign',
    type: 'choice',
    default: 'milestone',
    choices: [
      { key: 'xp',        label: 'Experience Points (XP)' },
      { key: 'milestone', label: 'Story / Milestone' },
    ],
  },
  {
    key: 'encumbrance',
    label: 'Encumbrance',
    description:
      'How carrying capacity is tracked. Standard uses a simple Strength × 15 cap; Variant adds Encumbered / Heavily Encumbered tiers; Disabled hides encumbrance entirely.',
    scope: 'campaign',
    type: 'choice',
    default: 'standard',
    choices: [
      { key: 'standard', label: 'Standard' },
      { key: 'variant',  label: 'Variant (encumbered tiers)' },
      { key: 'disabled', label: 'Disabled' },
    ],
  },
  {
    key: 'ignore_coin_weight',
    label: 'Ignore Coin Weight',
    description:
      'Coins do not count toward the carrying-capacity total (50 coins weigh 1 lb. by default). On for most modern campaigns since coin weight is rarely worth the bookkeeping.',
    scope: 'campaign',
    type: 'boolean',
    default: true,
    // Sub-item of Encumbrance — hidden entirely when encumbrance
    // is disabled (no point caring about coin weight if there's no
    // carrying-capacity tracking to begin with).
    parentKey: 'encumbrance',
    parentHiddenWhen: 'disabled',
  },
  {
    key: 'feats_at_level_1',
    label: 'Feats at Level 1',
    description:
      'Grant every character a feat at first level in addition to their class features. Standard in the 2024 rules (each background grants a starting feat); a common house rule in 2014 campaigns.',
    scope: 'campaign',
    type: 'boolean',
    default: true,
  },

  // ── Character-scoped rules — player picks during creation ────────────────
  {
    key: 'hit_point_method',
    label: 'Hit Points',
    description:
      'How additional hit points are determined when leveling up. Fixed grants the average value listed for the class; Rolled lets the player roll their hit die each level.',
    scope: 'character',
    type: 'choice',
    default: 'fixed',
    choices: [
      { key: 'fixed',  label: 'Fixed (class average)' },
      { key: 'rolled', label: 'Rolled (per-level hit die)' },
    ],
  },
  {
    key: 'ability_score_method',
    label: 'Ability Scores',
    description:
      'How the six ability scores are generated at character creation. Standard Array uses the published 15/14/13/12/10/8 set; Point Buy gives 27 points to spend; Rolled uses 4d6-drop-lowest.',
    scope: 'character',
    type: 'choice',
    default: 'standard_array',
    choices: [
      { key: 'standard_array', label: 'Standard Array (15/14/13/12/10/8)' },
      { key: 'point_buy',      label: 'Point Buy (27 points)' },
      { key: 'rolled',         label: 'Rolled (4d6 drop lowest)' },
    ],
  },
];
