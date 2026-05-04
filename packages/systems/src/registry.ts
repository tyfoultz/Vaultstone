// Single source of truth for the system-id → bundled-definition lookup.
// The `system` column on campaigns / characters / packs is a free-form
// text key; this map turns those keys into the rich `GameSystemDefinition`
// the UI needs (display name, version, license, etc.).
//
// 'dnd5e' is the legacy alias for the 2024 system — pre-split characters
// and campaigns reference that bare key, so we resolve it to the 2024
// edition until they're migrated.

import { dnd5e2014System, dnd5e2024System } from './dnd5e';
import { customSystem } from './custom';
import type { GameSystemDefinition } from './types';

export const BUNDLED_SYSTEMS_BY_ID: Record<string, GameSystemDefinition> = {
  dnd5e:       dnd5e2024System,
  dnd5e_2014:  dnd5e2014System,
  dnd5e_2024:  dnd5e2024System,
  custom:      customSystem,
};

/**
 * Display order used by selectors that show the full bundled list (the
 * campaign-create system picker, etc.). Excludes the legacy `dnd5e`
 * alias since users shouldn't pick the unversioned key for new entries.
 */
export const BUNDLED_SYSTEMS_ORDER: GameSystemDefinition[] = [
  dnd5e2024System,
  dnd5e2014System,
  customSystem,
];
