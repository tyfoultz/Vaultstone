// Native (iOS/Android) on-device full-text search over user-uploaded PDFs.
//
// Uses SQLite FTS5 via expo-sqlite. All text stays on the device; nothing here
// ever contacts the network. See docs/legal.md for the hard constraint.
//
// Schema lives in the same `vaultstone_local.db` file as user_content_sources
// (see db.native.ts) so they can be joined if needed later.

import * as SQLite from 'expo-sqlite';
import type {
  IndexMeta,
  IndexStatus,
  LocalContentHit,
  PageText,
} from '@vaultstone/types';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync('vaultstone_local.db');
  await db.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
      source_id UNINDEXED,
      page_number UNINDEXED,
      text,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS source_index_meta (
      source_id     TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'not_indexed',
      pages_indexed INTEGER NOT NULL DEFAULT 0,
      total_pages   INTEGER,
      indexed_at    TEXT,
      error         TEXT
    );
  `);
  _db = db;
  return db;
}

export async function getIndexStatus(sourceId: string): Promise<IndexMeta> {
  const db = await getDb();
  const row = await db.getFirstAsync<IndexMeta>(
    'SELECT * FROM source_index_meta WHERE source_id = ? LIMIT 1',
    [sourceId],
  );
  return row ?? {
    source_id: sourceId,
    status: 'not_indexed',
    pages_indexed: 0,
    total_pages: null,
    indexed_at: null,
    error: null,
  };
}

export async function setIndexStatus(
  patch: Partial<IndexMeta> & { source_id: string },
): Promise<void> {
  const db = await getDb();
  const current = await getIndexStatus(patch.source_id);
  const next: IndexMeta = { ...current, ...patch };
  await db.runAsync(
    `INSERT OR REPLACE INTO source_index_meta
       (source_id, status, pages_indexed, total_pages, indexed_at, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      next.source_id, next.status, next.pages_indexed,
      next.total_pages, next.indexed_at, next.error,
    ],
  );
}

/** Replace any existing FTS rows for (source, page) with the given pages. */
export async function indexPages(pages: PageText[]): Promise<void> {
  if (pages.length === 0) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const p of pages) {
      await tx.runAsync(
        'DELETE FROM content_fts WHERE source_id = ? AND page_number = ?',
        [p.sourceId, p.pageNumber],
      );
      await tx.runAsync(
        'INSERT INTO content_fts (source_id, page_number, text) VALUES (?, ?, ?)',
        [p.sourceId, p.pageNumber, p.text],
      );
    }
  });
}

export async function deleteIndexForSource(sourceId: string): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM content_fts WHERE source_id = ?', [sourceId]);
    await tx.runAsync('DELETE FROM source_index_meta WHERE source_id = ?', [sourceId]);
  });
}

export async function searchIndex(
  sourceIds: string[],
  query: string,
  limit = 25,
): Promise<LocalContentHit[]> {
  const trimmed = query.trim();
  if (!trimmed || sourceIds.length === 0) return [];

  const db = await getDb();
  const placeholders = sourceIds.map(() => '?').join(',');
  // Column index 2 = `text` (source_id=0, page_number=1, text=2).
  const rows = await db.getAllAsync<{
    source_id: string;
    page_number: number;
    snippet: string;
  }>(
    `SELECT source_id, page_number,
            snippet(content_fts, 2, '[', ']', '…', 16) AS snippet
       FROM content_fts
      WHERE content_fts MATCH ? AND source_id IN (${placeholders})
      ORDER BY bm25(content_fts)
      LIMIT ?`,
    [trimmed, ...sourceIds, limit],
  );
  return rows.map((r) => ({
    sourceId: r.source_id,
    pageNumber: r.page_number,
    snippet: r.snippet,
  }));
}

export type { IndexMeta, IndexStatus, LocalContentHit, PageText };
