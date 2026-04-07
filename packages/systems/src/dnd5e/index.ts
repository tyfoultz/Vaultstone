import type { GameSystemDefinition } from '@vaultstone/types';
import { attributes } from './attributes';
import { resourcePools } from './resources';
import { creationSteps } from './creation-steps';

export const dnd5eSystem: GameSystemDefinition = {
  id: 'dnd5e',
  displayName: "D&D 5th Edition",
  version: '2024',
  license: 'CC-BY-4.0',
  isBundled: true,
  attributes,
  resourcePools,
  creationSteps,
  sheetSections: [
    { key: 'ability_scores', label: 'Ability Scores', order: 1 },
    { key: 'combat', label: 'Combat', order: 2 },
    { key: 'spells', label: 'Spells', order: 3 },
    { key: 'features', label: 'Features & Traits', order: 4 },
    { key: 'equipment', label: 'Equipment', order: 5 },
    { key: 'notes', label: 'Notes', order: 6 },
  ],
};
