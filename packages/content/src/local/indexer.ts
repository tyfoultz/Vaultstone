// Platform-agnostic facade over the on-device content search index.
//
// Callers supply already-extracted page text; this module does not know how
// to parse PDFs. A future `packages/content/src/local/pdf-parser.{native,web}.ts`
// will produce `PageText[]` that gets passed into `indexSource`.
//
// Keeping parsing out of here means the search layer is independent of the
// PDF toolchain and trivially unit-testable with fixture text.

import {
  deleteIndexForSource,
  getIndexStatus as _getIndexStatus,
  indexPages,
  searchIndex,
  setIndexStatus,
} from './search-db';
import { getSourcesByCampaign } from './db';
import type {
  IndexMeta,
  IndexStatus,
  LocalContentHit,
  PageText,
} from '@vaultstone/types';

export type { IndexMeta, IndexStatus, LocalContentHit, PageText };

/** A search hit joined with the parent source's filename for display. */
export type CampaignHit = LocalContentHit & { fileName: string };

/**
 * Index a source's pages. Caller is responsible for extracting text from the
 * PDF before invoking this. Status transitions:
 *   not_indexed → indexing → indexed    (success)
 *   not_indexed → indexing → failed     (error, `error` field populated)
 *
 * Calling this again on an already-indexed source replaces its content.
 */
export async function indexSource(
  sourceId: string,
  pages: PageText[],
): Promise<void> {
  await setIndexStatus({
    source_id: sourceId,
    status: 'indexing',
    total_pages: pages.length,
    pages_indexed: 0,
    error: null,
  });
  try {
    await indexPages(pages);
    await setIndexStatus({
      source_id: sourceId,
      status: 'indexed',
      pages_indexed: pages.length,
      total_pages: pages.length,
      indexed_at: new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    await setIndexStatus({
      source_id: sourceId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Wipe all indexed pages + meta for a source (e.g. when the PDF is removed). */
export async function removeSourceFromIndex(sourceId: string): Promise<void> {
  await deleteIndexForSource(sourceId);
}

export function getIndexStatus(sourceId: string): Promise<IndexMeta> {
  return _getIndexStatus(sourceId);
}

/**
 * Free-text search across all PDFs uploaded to a campaign (only those
 * belonging to the current device/user — PDFs are never shared).
 * Returns ranked hits with a page number + highlighted snippet.
 */
export async function searchCampaign(
  campaignId: string,
  query: string,
  limit = 25,
): Promise<CampaignHit[]> {
  const sources = await getSourcesByCampaign(campaignId);
  if (sources.length === 0) return [];
  const hits = await searchIndex(sources.map((s) => s.id), query, limit);
  const nameById = new Map(sources.map((s) => [s.id, s.file_name]));
  return hits.map((h) => ({
    ...h,
    fileName: nameById.get(h.sourceId) ?? 'Unknown source',
  }));
}

/** Snapshot of indexing state for every source in a campaign. */
export async function getCampaignIndexStatuses(
  campaignId: string,
): Promise<Array<IndexMeta & { fileName: string }>> {
  const sources = await getSourcesByCampaign(campaignId);
  const metas = await Promise.all(sources.map((s) => _getIndexStatus(s.id)));
  return metas.map((m, i) => ({ ...m, fileName: sources[i].file_name }));
}
