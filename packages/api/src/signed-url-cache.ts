const CACHE_KEY_PREFIX = 'vs:surl:';

interface CachedUrl {
  signedUrl: string;
  expiresAt: number;
}

const memCache = new Map<string, CachedUrl>();

function persistToStorage(key: string, entry: CachedUrl) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    }
  } catch { /* native or quota exceeded — in-memory cache still works */ }
}

function readFromStorage(key: string): CachedUrl | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + key);
      if (raw) return JSON.parse(raw);
    }
  } catch { /* ignore */ }
  return null;
}

export function getCachedSignedUrl(key: string): string | null {
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.signedUrl;

  const stored = readFromStorage(key);
  if (stored && stored.expiresAt > Date.now()) {
    memCache.set(key, stored);
    return stored.signedUrl;
  }

  return null;
}

export function setCachedSignedUrl(key: string, signedUrl: string, expiresInSeconds: number) {
  const entry: CachedUrl = {
    signedUrl,
    expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
  };
  memCache.set(key, entry);
  persistToStorage(key, entry);
}

export function clearCachedSignedUrl(key: string) {
  memCache.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CACHE_KEY_PREFIX + key);
    }
  } catch { /* ignore */ }
}
