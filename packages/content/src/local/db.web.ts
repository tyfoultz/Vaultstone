// Web implementation of local source storage.
// Metadata (small strings) → localStorage.
// PDF blob (large binary) → IndexedDB with a singleton connection.
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

// ---- IndexedDB (singleton connection) ----

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

async function savePdfBlob(campaignId: string, blob: Blob): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, campaignId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
  });
}

async function loadPdfBlob(campaignId: string): Promise<Blob | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(campaignId);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePdfBlob(campaignId: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(campaignId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- In-memory blob cache (same-session fast path) ----

const _blobCache = new Map<string, Blob>();

// ---- Public API ----

export async function getSourceByCampaign(campaignId: string): Promise<LocalSource | null> {
  const meta = loadMeta().find((s) => s.campaign_id === campaignId);
  if (!meta) return null;

  // Check memory cache first (same-session, instant)
  let blob = _blobCache.get(campaignId) ?? null;

  // Fall back to IndexedDB (cross-session persistence)
  if (!blob) {
    blob = await loadPdfBlob(campaignId);
    if (!blob) {
      // Blob was cleared (e.g. user cleared site data) — remove stale metadata
      persistMeta(loadMeta().filter((s) => s.campaign_id !== campaignId));
      return null;
    }
    _blobCache.set(campaignId, blob);
  }

  return { ...meta, file_path: URL.createObjectURL(blob) };
}

export async function saveSource(source: LocalSource): Promise<void> {
  // source.file_path is a blob: URL — fetch the actual bytes and store in IndexedDB
  const response = await fetch(source.file_path);
  const blob = await response.blob();

  // Update memory cache immediately so same-session reads are instant
  _blobCache.set(source.campaign_id, blob);

  // Persist to IndexedDB for cross-session durability
  await savePdfBlob(source.campaign_id, blob);

  // Store only small metadata in localStorage (never the file content)
  const { file_path: _ignored, ...meta } = source;
  persistMeta([
    ...loadMeta().filter((s) => s.campaign_id !== source.campaign_id),
    meta,
  ]);
}

export async function deleteSource(campaignId: string): Promise<void> {
  _blobCache.delete(campaignId);
  await deletePdfBlob(campaignId);
  persistMeta(loadMeta().filter((s) => s.campaign_id !== campaignId));
}
