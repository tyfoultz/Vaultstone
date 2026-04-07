import type { CreationStep } from '@vaultstone/types';

export const creationSteps: CreationStep[] = [
  { key: 'species', label: 'Species', contentCollection: 'dnd5e.species', required: true },
  { key: 'class', label: 'Class', contentCollection: 'dnd5e.classes', required: true },
  { key: 'background', label: 'Background', contentCollection: 'dnd5e.backgrounds', required: true },
  { key: 'ability_scores', label: 'Ability Scores', contentCollection: 'dnd5e.ability_score_methods', required: true },
  { key: 'equipment', label: 'Starting Equipment', contentCollection: 'dnd5e.equipment', required: false },
  { key: 'name', label: 'Name & Details', contentCollection: '', required: true },
];
