import type { CreationStep } from '@vaultstone/types';

// Source of truth for the wizard's step list. The wizard's renderStep
// dispatch matches on these exact `key` values. Standalone wizards
// run every step; campaign-launched wizards skip `inCampaign: false`
// steps (today: just `'ruleset'`, since the campaign locks the
// system + packs).
//
// Optional rule gates: the L1 Feats step is gated by the
// `feats_at_level_1` campaign rule. When the rule is on (or in
// standalone mode where the system default is `true`) the wizard
// splices Feats between Background and Ability Scores.
export const creationSteps: CreationStep[] = [
  {
    key: 'ruleset',
    label: 'Ruleset',
    contentCollection: '',
    required: true,
    inCampaign: false,
  },
  {
    key: 'species',
    label: 'Species',
    contentCollection: 'dnd5e.species',
    required: true,
  },
  {
    key: 'class',
    label: 'Class',
    contentCollection: 'dnd5e.classes',
    required: true,
  },
  {
    key: 'background',
    label: 'Background',
    contentCollection: 'dnd5e.backgrounds',
    required: true,
  },
  {
    key: 'feats',
    label: 'Starting Feat',
    contentCollection: 'dnd5e.feats',
    required: true,
    gatedByRule: 'feats_at_level_1',
  },
  {
    key: 'scores',
    label: 'Ability Scores',
    contentCollection: '',
    required: true,
  },
  {
    key: 'review',
    label: 'Review',
    contentCollection: '',
    required: true,
  },
];
