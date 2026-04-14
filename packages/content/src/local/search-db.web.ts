// Web on-device full-text search over user-uploaded PDFs.
//
// Persists page text in IndexedDB (separate database from the PDF blob store,
// so we can evolve the schema independently). Search is a simple
// case-insensitive substring scan with snippet extraction — good enough for
// a few hundred pages per session. We can swap in a proper inverted index
// (minisearch / lunr) later without changing the public API.
//
// Nothing in this module ever leaves the browser. See docs/legal.md.

import type {
  IndexMeta,
  IndexStatus,
  LocalContentHit,
  PageText,
} from '@vaultstone/types';

const IDB_NAME = 'vaultstone_search';
const IDB_VERSION = 1;
const PAGES_STORE = 'pages';
const META_STORE = 'index_meta';

type StoredPage = {
  key: string; // `${sourceId}:${pageNumber}`
  sourceId: string;
  pageNumber: number;
  text: string;
};

let _idb: IDBDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGES_STORE)) {
        const store = db.createObjectStore(PAGES_STORE, { keyPath: 'key' });
        store.createIndex('by_source', 'sourceId');
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'source_id' });
      }
    };
    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };
    req.onerror = () => reject(req.error);
  });
}

function pageKey(sourceId: string, pageNumber: number): string {
  return `${sourceId}:${pageNumber}`;
}

// ---------- Index-meta ----------

const DEFAULT_META = (sourceId: string): IndexMeta => ({
  source_id: sourceId,
  status: 'not_indexed',
  pages_indexed: 0,
  total_pages: null,
  indexed_at: null,
  error: null,
});

export async function getIndexStatus(sourceId: string): Promise<IndexMeta> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(sourceId);
    req.onsuccess = () => resolve((req.result as IndexMeta | undefined) ?? DEFAULT_META(sourceId));
    req.onerror = () => reject(req.error);
  });
}

export async function setIndexStatus(
  patch: Partial<IndexMeta> & { source_id: string },
): Promise<void> {
  const current = await getIndexStatus(patch.source_id);
  const next: IndexMeta = { ...current, ...patch };
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Pages (write) ----------

export async function indexPages(pages: PageText[]): Promise<void> {
  if (pages.length === 0) return;
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGES_STORE, 'readwrite');
    const store = tx.objectStore(PAGES_STORE);
    for (const p of pages) {
      const record: StoredPage = {
        key: pageKey(p.sourceId, p.pageNumber),
        sourceId: p.sourceId,
        pageNumber: p.pageNumber,
        text: p.text,
      };
      store.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
  });
}

export async function deleteIndexForSource(sourceId: string): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PAGES_STORE, 'readwrite');
    const store = tx.objectStore(PAGES_STORE);
    const idx = store.index('by_source');
    const req = idx.openCursor(IDBKeyRange.only(sourceId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(sourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Search ----------

async function loadPagesForSources(sourceIds: string[]): Promise<StoredPage[]> {
  if (sourceIds.length === 0) return [];
  const db = await openIdb();
  const results: StoredPage[] = [];
  await Promise.all(
    sourceIds.map(
      (sid) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(PAGES_STORE, 'readonly');
          const idx = tx.objectStore(PAGES_STORE).index('by_source');
          const req = idx.openCursor(IDBKeyRange.only(sid));
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              results.push(cursor.value as StoredPage);
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  return results;
}

function makeSnippet(text: string, query: string, window = 80): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const i = lower.indexOf(q);
  if (i === -1) return text.slice(0, window * 2) + (text.length > window * 2 ? '…' : '');
  const start = Math.max(0, i - window);
  const end = Math.min(text.length, i + q.length + window);
  const before = start > 0 ? '…' : '';
  const after = end < text.length ? '…' : '';
  const head = text.slice(start, i);
  const match = text.slice(i, i + q.length);
  const tail = text.slice(i + q.length, end);
  return `${before}${head}[${match}]${tail}${after}`;
}

export async function searchIndex(
  sourceIds: string[],
  query: string,
  limit = 25,
): Promise<LocalContentHit[]> {
  const trimmed = query.trim();
  if (!trimmed || sourceIds.length === 0) return [];
  const pages = await loadPagesForSources(sourceIds);
  const lower = trimmed.toLowerCase();

  const hits: LocalContentHit[] = [];
  for (const page of pages) {
    if (page.text.toLowerCase().includes(lower)) {
      hits.push({
        sourceId: page.sourceId,
        pageNumber: page.pageNumber,
        snippet: makeSnippet(page.text, trimmed),
      });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export type { IndexMeta, IndexStatus, LocalContentHit, PageText };
