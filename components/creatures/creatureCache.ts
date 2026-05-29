import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContentResolver } from '@vaultstone/content';
import type { CreatureResult } from '@vaultstone/types';

const CREATURE_CACHE_KEY = 'vaultstone:creature-cache:v1';
const CREATURE_CACHE_TTL = 24 * 60 * 60 * 1000;

let _cache: Record<string, { data: CreatureResult; fetchedAt: number }> = {};
let _hydrated = false;

async function hydrate(): Promise<Record<string, { data: CreatureResult; fetchedAt: number }>> {
  if (_hydrated) return _cache;
  _hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CREATURE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const valid: Record<string, { data: CreatureResult; fetchedAt: number }> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const entry = v as { data: CreatureResult; fetchedAt: number };
        if (entry.fetchedAt && now - entry.fetchedAt < CREATURE_CACHE_TTL) {
          valid[k] = entry;
        }
      }
      _cache = valid;
    }
  } catch {}
  return _cache;
}

function persist() {
  try {
    AsyncStorage.setItem(CREATURE_CACHE_KEY, JSON.stringify(_cache)).catch(() => {});
  } catch {}
}

export async function getCachedCreature(key: string): Promise<CreatureResult | null> {
  if (_cache[key]) return _cache[key].data;
  const disk = await hydrate();
  if (disk[key]) return disk[key].data;
  return null;
}

export function setCachedCreature(key: string, creature: CreatureResult) {
  _cache[key] = { data: creature, fetchedAt: Date.now() };
  persist();
}

export async function loadCreatureByKey(key: string): Promise<CreatureResult | null> {
  const cached = await getCachedCreature(key);
  if (cached) return cached;
  const result = await ContentResolver.getByKey(key);
  if (result && result.type === 'monster') {
    const creature = result as CreatureResult;
    setCachedCreature(key, creature);
    return creature;
  }
  return null;
}

// --- Full catalog cache for encounter builder ---

const CATALOG_CACHE_KEY = 'vaultstone:creature-catalog-cache:v2';
let _catalogCache: CreatureResult[] | null = null;
let _catalogFetchedAt = 0;

export async function getCreatureCatalog(system: string): Promise<CreatureResult[]> {
  if (_catalogCache && Date.now() - _catalogFetchedAt < CREATURE_CACHE_TTL) {
    return _catalogCache;
  }
  // Try disk
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: CreatureResult[]; fetchedAt: number };
      if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < CREATURE_CACHE_TTL) {
        _catalogCache = parsed.data;
        _catalogFetchedAt = parsed.fetchedAt;
        return _catalogCache;
      }
    }
  } catch {}
  // Fetch fresh
  const results = await ContentResolver.search({ type: 'monster', system });
  _catalogCache = results as CreatureResult[];
  _catalogFetchedAt = Date.now();
  // Persist (fire-and-forget)
  try {
    AsyncStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ data: _catalogCache, fetchedAt: _catalogFetchedAt }),
    ).catch(() => {});
  } catch {}
  // Also populate individual creature cache
  for (const c of _catalogCache) {
    if (c.key && !_cache[c.key]) {
      _cache[c.key] = { data: c, fetchedAt: _catalogFetchedAt };
    }
  }
  persist();
  return _catalogCache;
}
