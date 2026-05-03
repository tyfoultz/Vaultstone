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

/**
 * Per-source-book aggregation across every imported entry on this system.
 * Used by the Imported Content tab to drive the source-book filter chips
 * and the breakdown display ("PHB: 36 subclasses, XGE: 12 spells").
 *
 * Entries with no `importSource` are bucketed under code `__unknown__` so
 * they don't disappear from the UI — every imported entry should carry a
 * source, but transforms for older content might not.
 */
export type SourceBreakdown = {
  /** Source code as it appeared on the entry (e.g. "PHB", "XGE"). */
  code: string;
  /** Display name pulled from the entry's importSource.name. */
  name: string;
  /** Total entries from this source across all content types. */
  total: number;
  /** Per-content-type counts under this source. */
  byType: Partial<Record<string, number>>;
};

export async function getSourceBreakdown(systemId: string): Promise<SourceBreakdown[]> {
  const entries = await loadAllEntries(systemId);
  const acc = new Map<string, SourceBreakdown>();
  for (const e of entries) {
    const code = e.importSource?.code ?? '__unknown__';
    const name = e.importSource?.name ?? 'Unknown source';
    const slot = acc.get(code) ?? { code, name, total: 0, byType: {} };
    slot.total += 1;
    slot.byType[e.type] = (slot.byType[e.type] ?? 0) + 1;
    acc.set(code, slot);
  }
  // Sort by total descending so the most-represented sources surface first.
  return [...acc.values()].sort((a, b) => b.total - a.total);
}

/**
 * Load every imported entry for a system, optionally filtered to a single
 * source-book code. Used by the per-source-book filter view to render
 * entries that match the selected book.
 */
export async function loadEntriesBySource(
  systemId: string,
  sourceCode: string | null,
): Promise<ContentResult[]> {
  const entries = await loadAllEntries(systemId);
  if (!sourceCode) return entries;
  return entries.filter((e) => (e.importSource?.code ?? '__unknown__') === sourceCode);
}

// Transforms — converters from external schemas (currently 5e.tools) to our
// *Result shapes. Used by the import UI; safe to call on-device.
export { transformSubclasses } from './transform/subclasses';
export type { RawClassFile, TransformOptions } from './transform/subclasses';
export { stripMarkup } from './transform/markup';
