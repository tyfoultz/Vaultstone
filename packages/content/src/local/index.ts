import type { ContentResult, ContentQuery } from '@vaultstone/types';

// Local PDF content is indexed in device SQLite via FTS5.
// Extracted text NEVER leaves the device.

export async function search(_query: ContentQuery): Promise<ContentResult[]> {
  // TODO: query local SQLite FTS5 index
  return [];
}
