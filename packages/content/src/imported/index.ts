// Imported-tier resolver entry. The ContentResolver dynamically imports
// this module when the 'imported' tier is requested, calls `search()`, and
// merges results with the SRD and homebrew tiers.
//
// Storage is on-device; this module is the only place that touches it.
// Re-importing replaces a batch wholesale; deletion cascades to entries.

import type { ContentResult, ContentQuery } from '@vaultstone/types';
import {
  listBatches as _listBatches,
  saveBatch as _saveBatch,
  removeBatch as _removeBatch,
  loadAllEntries,
  loadEntriesByBatch as _loadEntriesByBatch,
} from './db';
import type { ImportBatch } from './db-types';

/**
 * Resolver entry — returns every imported entry for the requested system,
 * filtered by query. Mirrors the shape of srd/index.ts `search()`.
 */
export async function search(query: ContentQuery): Promise<ContentResult[]> {
  if (!query.system) return [];
  const all = await loadAllEntries(query.system);

  let results = all;
  if (query.type) {
    results = results.filter((r) => r.type === query.type);
  }
  if (query.search) {
    const term = query.search.toLowerCase();
    results = results.filter(
      (r) => r.name.toLowerCase().includes(term) || r.key.toLowerCase().includes(term),
    );
  }
  return results;
}

// ── Public batch management API ─────────────────────────────────────────────
// Re-exported through the package barrel so the import UI can drive the
// storage layer without importing the platform-split db module directly.

export const listBatches = _listBatches;
export const saveBatch = _saveBatch;
export const removeBatch = _removeBatch;
export const loadEntriesByBatch = _loadEntriesByBatch;

export type { ImportBatch };
