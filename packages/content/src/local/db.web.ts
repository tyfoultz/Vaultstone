// Web implementation of local source storage.
// Metadata (small strings) → localStorage.
// PDF blobs (large binary) → IndexedDB, keyed by source.id.
// In-memory blob cache for same-session fast access.

export type LocalSource = {
  id: string;
  campaign_id: string;
  source_key: string;
  file_name: string;
  file_path: string; // ephemeral object URL, valid for current session
  uploaded_at: string;
};

// ---- Metadata (localStorage) ----

type SourceMeta = Omit<LocalSource, 'file_path'>;
const META_KEY = 'vaultstone_content_sources';

function loadMeta(): SourceMeta[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistMeta(sources: SourceMeta[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(sources));
}

// ---- IndexedDB (singleton connection, blobs keyed by source.id) ----

const IDB_NAME = 'vaultstone_pdfs';
const IDB_STORE = 'blobs';
let _idb: IDBDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function savePdfBlob(sourceId: string, blob: Blob): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, sourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
  });
}

async function loadPdfBlob(sourceId: string): Promise<Blob | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(sourceId);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePdfBlob(sourceId: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(sourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- In-memory blob cache (same-session fast path, keyed by source.id) ----

const _blobCache = new Map<string, Blob>();

// ---- Shared helper: resolve a blob to an object URL ----

async function resolveSource(meta: SourceMeta): Promise<LocalSource | null> {
  let blob = _blobCache.get(meta.id) ?? null;
  if (!blob) {
    blob = await loadPdfBlob(meta.id);
    if (!blob) return null;
    _blobCache.set(meta.id, blob);
  }
  return { ...meta, file_path: URL.createObjectURL(blob) };
}

// ---- Public API ----

export async function getSourcesByCampaign(campaignId: string): Promise<LocalSource[]> {
  const metas = loadMeta().filter((s) => s.campaign_id === campaignId);
  if (metas.length === 0) return [];

  const results = await Promise.all(metas.map(resolveSource));

  // Filter out any entries whose blobs were cleared (stale metadata), and clean up
  const staleIds = metas
    .map((m, i) => (results[i] === null ? m.id : null))
    .filter((id): id is string => id !== null);

  if (staleIds.length > 0) {
    persistMeta(loadMeta().filter((s) => !staleIds.includes(s.id)));
  }

  return results.filter((s): s is LocalSource => s !== null);
}

export async function getSourceById(sourceId: string): Promise<LocalSource | null> {
  const meta = loadMeta().find((s) => s.id === sourceId);
  if (!meta) return null;
  return resolveSource(meta);
}

export async function saveSource(source: LocalSource): Promise<void> {
  // source.file_path is a blob: URL — fetch the actual bytes and persist to IndexedDB
  const response = await fetch(source.file_path);
  const blob = await response.blob();

  _blobCache.set(source.id, blob);
  await savePdfBlob(source.id, blob);

  // Append metadata; replace if same id already exists
  const { file_path: _ignored, ...meta } = source;
  persistMeta([...loadMeta().filter((s) => s.id !== source.id), meta]);
}

export async function deleteSourceById(sourceId: string): Promise<void> {
  _blobCache.delete(sourceId);
  await deletePdfBlob(sourceId);
  persistMeta(loadMeta().filter((s) => s.id !== sourceId));
}
