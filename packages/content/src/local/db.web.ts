// Web implementation of local source storage.
// Metadata (small strings) → localStorage.
// PDF blob (large binary) → IndexedDB.
// file_path is a fresh object URL recreated from the IndexedDB blob on each load.

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

// ---- PDF blobs (IndexedDB) ----

const IDB_NAME = 'vaultstone_pdfs';
const IDB_STORE = 'blobs';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
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

// ---- Public API ----

export async function getSourceByCampaign(campaignId: string): Promise<LocalSource | null> {
  const meta = loadMeta().find((s) => s.campaign_id === campaignId);
  if (!meta) return null;

  const blob = await loadPdfBlob(campaignId);
  if (!blob) {
    // Blob was cleared (e.g. user cleared site data); remove stale metadata
    persistMeta(loadMeta().filter((s) => s.campaign_id !== campaignId));
    return null;
  }

  return { ...meta, file_path: URL.createObjectURL(blob) };
}

export async function saveSource(source: LocalSource): Promise<void> {
  // source.file_path is a blob: URL — fetch it to get the real Blob and persist to IndexedDB
  const response = await fetch(source.file_path);
  const blob = await response.blob();
  await savePdfBlob(source.campaign_id, blob);

  // Store only small metadata in localStorage (never the file content)
  const { file_path: _ignored, ...meta } = source;
  persistMeta([
    ...loadMeta().filter((s) => s.campaign_id !== source.campaign_id),
    meta,
  ]);
}

export async function deleteSource(campaignId: string): Promise<void> {
  await deletePdfBlob(campaignId);
  persistMeta(loadMeta().filter((s) => s.campaign_id !== campaignId));
}
