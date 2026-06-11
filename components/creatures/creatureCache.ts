import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContentResolver, systemQueryArgs } from '@vaultstone/content';
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

// v3: keyed per edition — v2 stored one undifferentiated catalog, so a
// 2014-edition campaign could be served a cached 2024 catalog (and vice
// versa).
const CATALOG_CACHE_KEY = 'vaultstone:creature-catalog-cache:v3';
const _catalogCache: Record<string, { data: CreatureResult[]; fetchedAt: number }> = {};

/**
 * `systemId` is the campaign's raw system id (dnd5e_2014 / dnd5e_2024 /
 * legacy dnd5e) — it's translated through systemQueryArgs so both the SRD
 * tier (keyed under 'dnd5e' + srdVersion) and the homebrew tier (keyed
 * under edition-suffixed pack system ids) scope to the right edition.
 */
export async function getCreatureCatalog(systemId: string): Promise<CreatureResult[]> {
  const args = systemQueryArgs(systemId);
  const cacheKey = `${CATALOG_CACHE_KEY}:${args.srdVersion}`;
  const mem = _catalogCache[cacheKey];
  if (mem && Date.now() - mem.fetchedAt < CREATURE_CACHE_TTL) {
    return mem.data;
  }
  // Try disk
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: CreatureResult[]; fetchedAt: number };
      if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < CREATURE_CACHE_TTL) {
        _catalogCache[cacheKey] = parsed;
        return parsed.data;
      }
    }
  } catch {}
  // Fetch fresh
  const results = (await ContentResolver.search({ type: 'monster', ...args })) as CreatureResult[];
  const fetchedAt = Date.now();
  _catalogCache[cacheKey] = { data: results, fetchedAt };
  // Persist (fire-and-forget)
  try {
    AsyncStorage.setItem(cacheKey, JSON.stringify({ data: results, fetchedAt })).catch(() => {});
  } catch {}
  // Also populate individual creature cache
  for (const c of results) {
    if (c.key && !_cache[c.key]) {
      _cache[c.key] = { data: c, fetchedAt };
    }
  }
  persist();
  return results;
}
