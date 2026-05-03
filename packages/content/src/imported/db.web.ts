// Web storage for imported content. Same surface as db.native.ts; backed by
// IndexedDB. We use a singleton connection and two object stores:
//   batches  — keyed by batch.id
//   entries  — composite key [batch_id, entry_key]; system_id index for reads
//
// Re-import semantics match native: saveBatch() drops every entry under the
// existing batch id before re-inserting. removeBatch() cascades.

import type { ContentResult } from '@vaultstone/types';
import type { ImportBatch, ImportedEntryRow } from './db-types';

const IDB_NAME = 'vaultstone_imported';
const IDB_VERSION = 1;
const BATCHES = 'batches';
const ENTRIES = 'entries';

let _db: IDBDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BATCHES)) {
        const batches = db.createObjectStore(BATCHES, { keyPath: 'id' });
        batches.createIndex('system_id', 'system_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(ENTRIES)) {
        const entries = db.createObjectStore(ENTRIES, { keyPath: ['batch_id', 'entry_key'] });
        entries.createIndex('system_id', 'system_id', { unique: false });
        entries.createIndex('batch_id', 'batch_id', { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listBatches(systemId?: string): Promise<ImportBatch[]> {
  const db = await openIdb();
  const all = await new Promise<ImportBatch[]>((resolve, reject) => {
    const tx = db.transaction(BATCHES, 'readonly');
    const req = tx.objectStore(BATCHES).getAll();
    req.onsuccess = () => resolve((req.result as ImportBatch[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const filtered = systemId ? all.filter((b) => b.system_id === systemId) : all;
  return filtered.sort((a, b) => b.imported_at.localeCompare(a.imported_at));
}

export async function saveBatch(
  batch: Omit<ImportBatch, 'entry_count'>,
  entries: ContentResult[],
): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BATCHES, ENTRIES], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));

    // Wipe existing entries for this batch before re-inserting.
    const entryStore = tx.objectStore(ENTRIES);
    const idx = entryStore.index('batch_id');
    const cursorReq = idx.openCursor(IDBKeyRange.only(batch.id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        // Insert/update the batch metadata.
        tx.objectStore(BATCHES).put({ ...batch, entry_count: entries.length });
        // Insert each entry as a serialised row.
        for (const e of entries) {
          const row: ImportedEntryRow = {
            batch_id: batch.id,
            entry_key: e.key,
            content_type: e.type,
            system_id: e.system,
            payload_json: JSON.stringify(e),
          };
          entryStore.put(row);
        }
      }
    };
  });
}

export async function removeBatch(batchId: string): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BATCHES, ENTRIES], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    const entryStore = tx.objectStore(ENTRIES);
    const cursorReq = entryStore.index('batch_id').openCursor(IDBKeyRange.only(batchId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        tx.objectStore(BATCHES).delete(batchId);
      }
    };
  });
}

export async function loadAllEntries(systemId: string): Promise<ContentResult[]> {
  const db = await openIdb();
  const rows = await new Promise<ImportedEntryRow[]>((resolve, reject) => {
    const tx = db.transaction(ENTRIES, 'readonly');
    const req = tx.objectStore(ENTRIES).index('system_id').getAll(IDBKeyRange.only(systemId));
    req.onsuccess = () => resolve((req.result as ImportedEntryRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return rows.map((r) => JSON.parse(r.payload_json) as ContentResult);
}

export async function loadEntriesByBatch(batchId: string): Promise<ContentResult[]> {
  const db = await openIdb();
  const rows = await new Promise<ImportedEntryRow[]>((resolve, reject) => {
    const tx = db.transaction(ENTRIES, 'readonly');
    const req = tx.objectStore(ENTRIES).index('batch_id').getAll(IDBKeyRange.only(batchId));
    req.onsuccess = () => resolve((req.result as ImportedEntryRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return rows.map((r) => JSON.parse(r.payload_json) as ContentResult);
}
