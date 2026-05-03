// Native (iOS/Android) storage for imported content.
// Persists per-user imports to a dedicated SQLite database, separate from the
// PDF-source DB, so the two storage layers can evolve independently.
//
// Schema:
//   imported_batches  — one row per import (system × content type × source URL)
//   imported_entries  — denormalised payload rows; each entry serialised as JSON
//
// Re-importing a batch replaces every entry under it; remove() drops the batch
// and cascades to its entries. ContentResolver reads the entries directly via
// `loadAllEntries()` and merges them into search results.

import * as SQLite from 'expo-sqlite';
import type { ContentResult } from '@vaultstone/types';
import type { ImportBatch, ImportedEntryRow } from './db-types';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('vaultstone_imported.db');
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS imported_batches (
        id           TEXT PRIMARY KEY,
        system_id    TEXT NOT NULL,
        content_type TEXT NOT NULL,
        source_url   TEXT NOT NULL,
        source_label TEXT,
        imported_at  TEXT NOT NULL,
        entry_count  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS imported_entries (
        batch_id     TEXT NOT NULL REFERENCES imported_batches(id) ON DELETE CASCADE,
        entry_key    TEXT NOT NULL,
        content_type TEXT NOT NULL,
        system_id    TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (batch_id, entry_key)
      );
      CREATE INDEX IF NOT EXISTS imported_entries_system_type_idx
        ON imported_entries (system_id, content_type);
    `);
  }
  return _db;
}

export async function listBatches(systemId?: string): Promise<ImportBatch[]> {
  const db = await getDb();
  if (systemId) {
    return db.getAllAsync<ImportBatch>(
      'SELECT * FROM imported_batches WHERE system_id = ? ORDER BY imported_at DESC',
      [systemId],
    );
  }
  return db.getAllAsync<ImportBatch>('SELECT * FROM imported_batches ORDER BY imported_at DESC');
}

export async function saveBatch(
  batch: Omit<ImportBatch, 'entry_count'>,
  entries: ContentResult[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Replace any existing batch with the same id (re-import).
    await db.runAsync('DELETE FROM imported_entries WHERE batch_id = ?', [batch.id]);
    await db.runAsync('DELETE FROM imported_batches WHERE id = ?', [batch.id]);
    await db.runAsync(
      `INSERT INTO imported_batches
         (id, system_id, content_type, source_url, source_label, imported_at, entry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        batch.id, batch.system_id, batch.content_type, batch.source_url,
        batch.source_label ?? null, batch.imported_at, entries.length,
      ],
    );
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO imported_entries
           (batch_id, entry_key, content_type, system_id, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        [batch.id, e.key, e.type, e.system, JSON.stringify(e)],
      );
    }
  });
}

export async function removeBatch(batchId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM imported_entries WHERE batch_id = ?', [batchId]);
    await db.runAsync('DELETE FROM imported_batches WHERE id = ?', [batchId]);
  });
}

export async function loadAllEntries(systemId: string): Promise<ContentResult[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ImportedEntryRow>(
    'SELECT * FROM imported_entries WHERE system_id = ?',
    [systemId],
  );
  return rows.map((r) => JSON.parse(r.payload_json) as ContentResult);
}

export async function loadEntriesByBatch(batchId: string): Promise<ContentResult[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ImportedEntryRow>(
    'SELECT * FROM imported_entries WHERE batch_id = ?',
    [batchId],
  );
  return rows.map((r) => JSON.parse(r.payload_json) as ContentResult);
}
