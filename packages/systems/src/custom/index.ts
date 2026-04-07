import type { GameSystemDefinition } from '@vaultstone/types';

export const customSystem: GameSystemDefinition = {
  id: 'custom',
  displayName: 'Custom System',
  version: '1.0',
  license: 'custom',
  isBundled: false,
  attributes: [],
  resourcePools: [],
  creationSteps: [],
  sheetSections: [
    { key: 'stats', label: 'Stats', order: 1 },
    { key: 'resources', label: 'Resources', order: 2 },
    { key: 'notes', label: 'Notes', order: 3 },
  ],
};
