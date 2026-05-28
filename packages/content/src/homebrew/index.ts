// Homebrew content reader. The user's homebrew_content rows live in
// Supabase, scoped to packs (homebrew_packs) which are themselves tagged
// to a game system. ContentResolver delegates to this module's `search`
// at query time; we fetch the user's accessible packs + their entries
// and map each row's `data` jsonb to the matching `*Result` shape so the
// rest of the app (Game Systems tabs, character creation, etc.) doesn't
// need to know homebrew has a different storage path than SRD.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@vaultstone/api';
import type {
  ContentResult,
  ContentQuery,
  SpellResult,
  CreatureResult,
  ItemResult,
  FeatResult,
  ClassResult,
  SpeciesResult,
  BackgroundResult,
  SubclassResult,
  OptionalFeatureResult,
  OptionalFeatureKind,
  DeityResult,
  ConditionResult,
  HomebrewSpellData,
  HomebrewCreatureData,
  HomebrewItemData,
  HomebrewFeatData,
  HomebrewClassData,
  HomebrewSpeciesData,
  HomebrewBackgroundData,
  HomebrewSubclassData,
  HomebrewOptionalFeatureData,
  HomebrewDeityData,
  HomebrewConditionData,
} from '@vaultstone/types';

type HomebrewPackRow = {
  id: string;
  owner_user_id: string;
  system: string;
  name: string;
};

type HomebrewContentRow = {
  id: string;
  user_id: string;
  pack_id: string | null;
  content_type: string;
  name: string;
  data: unknown;
};

/**
 * Imported entries — separate Supabase table from homebrew_content because
 * the data shapes differ (imported carries the full *Result payload from
 * the on-device transforms, authored uses the slimmer Homebrew*Data
 * schema). Same parent pack, though, so the user-facing concept is unified.
 */
type ImportedContentRow = {
  id: string;
  user_id: string;
  pack_id: string;
  content_type: string;
  name: string;
  data: unknown;
  source_code: string | null;
  source_name: string | null;
  source_page: number | null;
};

// Module-level cache so concurrent/rapid search() calls (e.g. the system
// page rendering 8+ content-type tabs) share a single DB round-trip
// instead of each independently paginating through 3000+ rows.
// Persisted to AsyncStorage so the cache survives page refreshes and
// app restarts — imported content rarely changes.
//
// Freshness strategy: instead of a time-based TTL, we store the row
// counts alongside the data and periodically validate them with a HEAD
// request (zero-body — effectively free egress). The full fetch only
// fires when an import/delete actually changes the row count, or on
// first-ever load. Manual invalidation on import/delete still works
// as the immediate-path reset.
let _entryCache: {
  key: string;
  packs: HomebrewPackRow[];
  authored: HomebrewContentRow[];
  imported: ImportedContentRow[];
  authoredCount: number;
  importedCount: number;
  fetchedAt: number;
} | null = null;
// Hard safety limit — force refetch after 7 days even if counts match,
// to catch any edge case where data changed without a count delta
// (e.g. in-place row update, which normal import flows don't do).
const ENTRY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'vaultstone:homebrew-cache:v2:';
let _diskHydrated = false;

// Count-check debounce: skip the HEAD requests for 5 minutes after a
// successful check so the 8-call cold-load burst (and rapid tab
// switches) don't each fire their own validation round-trip.
let _lastCountCheckAt = 0;
let _countCheckPromise: Promise<boolean> | null = null;
const COUNT_CHECK_INTERVAL = 5 * 60 * 1000;

/**
 * Pack-scope resolution cache. The character sheet fires 8 concurrent
 * ContentResolver.search calls on cold load (one per content type the
 * resolver hydrates eagerly — species, class, subclass, background,
 * feat, condition, skill, item). Without this cache each one ran its
 * own `campaign_packs` + `homebrew_packs` Supabase queries before
 * reaching the entry cache — 16 round-trips per character open just to
 * decide which packs are in scope. This cache dedupes the burst
 * (concurrent callers share an in-flight promise) and keeps the
 * resolved scope around for a short TTL so rapid navigations don't
 * re-query either.
 */
type ScopeCacheEntry = {
  key: string;
  packs: HomebrewPackRow[];
  fetchedAt: number;
  /** In-flight resolution — concurrent callers await this same promise. */
  promise?: Promise<HomebrewPackRow[]>;
};
let _scopeCache: ScopeCacheEntry | null = null;
/** 60s is enough to cover the cold-load 8-call burst plus a quick
 *  pack-management round trip; longer would risk stale pack lists after
 *  the player toggles packs in the campaign settings. */
const SCOPE_CACHE_TTL = 60 * 1000;

export function invalidateHomebrewCache() {
  const oldKey = _entryCache?.key;
  _entryCache = null;
  _diskHydrated = false;
  _scopeCache = null;
  _lastCountCheckAt = 0;
  _countCheckPromise = null;
  if (oldKey) {
    // Clear both v1 (legacy) and v2 cache keys
    AsyncStorage.removeItem(STORAGE_KEY_PREFIX + oldKey).catch(() => {});
    AsyncStorage.removeItem('vaultstone:homebrew-cache:v1:' + oldKey).catch(() => {});
  }
}

/**
 * Validate the in-memory cache against Supabase row counts using HEAD
 * requests (zero body → zero egress). Returns true when counts match
 * (data hasn't changed), false when they differ or on error.
 *
 * Debounced: skips the network round-trip if a successful check ran
 * within COUNT_CHECK_INTERVAL. Deduplicated: concurrent callers share
 * a single in-flight promise.
 */
async function isCacheFresh(packIds: string[]): Promise<boolean> {
  if (!_entryCache) return false;

  // Hard safety TTL — force refetch regardless of counts
  if (Date.now() - _entryCache.fetchedAt > ENTRY_CACHE_TTL) return false;

  // Backward compat: old disk caches lack count fields — treat as stale
  if (_entryCache.authoredCount == null || _entryCache.importedCount == null) return false;

  // Debounce: trust the cache within the check interval
  if (Date.now() - _lastCountCheckAt < COUNT_CHECK_INTERVAL) return true;

  // Deduplicate concurrent checks (8-call burst shares one promise)
  if (_countCheckPromise) return _countCheckPromise;

  _countCheckPromise = (async () => {
    try {
      const [authoredRes, importedRes] = await Promise.all([
        supabase
          .from('homebrew_content')
          .select('*', { count: 'exact', head: true })
          .in('pack_id', packIds),
        supabase
          .from('imported_content')
          .select('*', { count: 'exact', head: true })
          .in('pack_id', packIds),
      ]);

      if (authoredRes.error || importedRes.error) return false;

      const fresh =
        (authoredRes.count ?? 0) === _entryCache!.authoredCount &&
        (importedRes.count ?? 0) === _entryCache!.importedCount;

      if (fresh) _lastCountCheckAt = Date.now();
      return fresh;
    } finally {
      _countCheckPromise = null;
    }
  })();

  return _countCheckPromise;
}

async function hydrateFromDisk(cacheKey: string): Promise<boolean> {
  if (_diskHydrated) return false;
  _diskHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + cacheKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.key === cacheKey &&
      typeof parsed.fetchedAt === 'number' &&
      Date.now() - parsed.fetchedAt < ENTRY_CACHE_TTL
    ) {
      _entryCache = parsed;
      return true;
    }
  } catch {}
  return false;
}

function persistToDisk(cache: NonNullable<typeof _entryCache>) {
  try {
    const json = JSON.stringify(cache);
    AsyncStorage.setItem(STORAGE_KEY_PREFIX + cache.key, json).catch(() => {});
  } catch {}
}

/**
 * Resolve the in-scope packs for a content query. Dedupes concurrent
 * callers (the 8-call cold-load burst from the character sheet shares
 * one in-flight promise) and caches the result for SCOPE_CACHE_TTL so
 * rapid navigations don't re-query Supabase.
 */
async function resolveScopedPacks(query: ContentQuery): Promise<HomebrewPackRow[]> {
  const packPart = query.packIds ? [...query.packIds].sort().join(',') : '';
  const key = [
    query.campaignId ?? '',
    packPart,
    query.system ?? '',
    query.srdVersion ?? '',
  ].join('|');

  if (_scopeCache && _scopeCache.key === key) {
    if (_scopeCache.promise) return _scopeCache.promise;
    if (Date.now() - _scopeCache.fetchedAt < SCOPE_CACHE_TTL) {
      return _scopeCache.packs;
    }
  }

  const promise = (async () => {
    let allowedPackIds: Set<string> | null = null;
    if (query.campaignId) {
      const { data: enabled, error: enabledErr } = await supabase
        .from('campaign_packs')
        .select('pack_id')
        .eq('campaign_id', query.campaignId)
        .eq('enabled', true);
      if (enabledErr) return [];
      allowedPackIds = new Set((enabled ?? []).map((r) => r.pack_id));
      if (allowedPackIds.size === 0) return [];
    } else if (query.packIds) {
      allowedPackIds = new Set(query.packIds);
      if (allowedPackIds.size === 0) return [];
    }
    let packsQuery = supabase
      .from('homebrew_packs')
      .select('id, owner_user_id, system, name');
    if (query.system) {
      const accepted = [...compatibleSystemIds(query.system, query.srdVersion)];
      packsQuery = packsQuery.in('system', accepted);
    }
    const packsRes = await packsQuery;
    if (packsRes.error) return [];
    const packs = (packsRes.data ?? []) as HomebrewPackRow[];
    return allowedPackIds ? packs.filter((p) => allowedPackIds!.has(p.id)) : packs;
  })();

  _scopeCache = { key, packs: [], fetchedAt: 0, promise };
  try {
    const packs = await promise;
    _scopeCache = { key, packs, fetchedAt: Date.now() };
    return packs;
  } catch {
    if (_scopeCache && _scopeCache.key === key) _scopeCache = null;
    return [];
  }
}

export async function search(query: ContentQuery): Promise<ContentResult[]> {
  const relevantPacks = await resolveScopedPacks(query);
  if (relevantPacks.length === 0) return [];
  const relevantPackIds = relevantPacks.map((p) => p.id);

  const baseCacheKey = [...relevantPackIds].sort().join(',');
  let authored: HomebrewContentRow[] | null = null;
  let imported: ImportedContentRow[] | null = null;

  // Try memory cache — validate with a cheap HEAD count check
  if (_entryCache && _entryCache.key === baseCacheKey && await isCacheFresh(relevantPackIds)) {
    authored = _entryCache.authored;
    imported = _entryCache.imported;
  }
  // Try disk cache — hydrate then validate counts
  if (authored === null && await hydrateFromDisk(baseCacheKey) && await isCacheFresh(relevantPackIds)) {
    authored = _entryCache!.authored;
    imported = _entryCache!.imported;
  }

  // Cache miss — fetch from Supabase
  if (authored === null && query.type) {
    const [a, i] = await Promise.all([
      fetchAllPaginated<HomebrewContentRow>(
        'homebrew_content',
        'id, user_id, pack_id, content_type, name, data',
        relevantPackIds,
        query.type,
      ),
      fetchAllPaginated<ImportedContentRow>(
        'imported_content',
        'id, user_id, pack_id, content_type, name, data, source_code, source_name, source_page',
        relevantPackIds,
        query.type,
      ),
    ]);
    authored = a;
    imported = i;
  } else if (authored === null) {
    const [a, i] = await Promise.all([
      fetchAllPaginated<HomebrewContentRow>(
        'homebrew_content',
        'id, user_id, pack_id, content_type, name, data',
        relevantPackIds,
      ),
      fetchAllPaginated<ImportedContentRow>(
        'imported_content',
        'id, user_id, pack_id, content_type, name, data, source_code, source_name, source_page',
        relevantPackIds,
      ),
    ]);
    authored = a;
    imported = i;
    if (authored !== null && imported !== null) {
      const entry = {
        key: baseCacheKey,
        packs: relevantPacks,
        authored,
        imported,
        authoredCount: authored.length,
        importedCount: imported.length,
        fetchedAt: Date.now(),
      };
      _entryCache = entry;
      _lastCountCheckAt = Date.now();
      persistToDisk(entry);
    }
  }

  if (authored === null || imported === null) return [];

  const packById = new Map(relevantPacks.map((p) => [p.id, p]));

  const results: ContentResult[] = [];
  for (const entry of authored) {
    if (!entry.pack_id) continue;
    const pack = packById.get(entry.pack_id);
    if (!pack) continue;
    const mapped = mapEntryToResult(entry, pack);
    if (mapped) results.push(mapped);
  }
  for (const entry of imported) {
    const pack = packById.get(entry.pack_id);
    if (!pack) continue;
    const mapped = mapImportedEntryToResult(entry, pack);
    if (mapped) results.push(mapped);
  }

  let filtered = results;
  if (query.srdVersion) {
    // Edition filter, applied only to entries that *positively claim*
    // an edition. Three sources of `srdVersions` on homebrew results:
    //   - Authored homebrew (HomebrewSpeciesData / HomebrewClassData /
    //     etc.) doesn't carry the field at all.
    //   - 5e.tools imports tag from the source code via
    //     `srdVersionsForSource` — X-prefixed books (XPHB, XDMG, XMM)
    //     land as `['SRD_2.0']`, the SRD compendium lands as both,
    //     everything else lands as `['SRD_5.1']`.
    //   - Open5e snapshots (rare in the homebrew tier, but possible
    //     for self-hosted SRD packs) emit `srdVersions: ['SRD_5.1']`
    //     etc. matching the SRD reader's tagging.
    // Treat both "no field" and "empty array" as "no claim" — pre-
    // edition-tagging imports + authored homebrew land in either
    // edition's wizard. Positively-claimed entries get filtered.
    const version = query.srdVersion;
    filtered = filtered.filter((r) => {
      const item = r as ContentResult & { srdVersions?: string[] };
      const versions = item.srdVersions;
      if (!versions || versions.length === 0) return true;
      return versions.includes(version);
    });
  }
  if (query.type) {
    filtered = filtered.filter((r) => r.type === query.type);
  }
  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(term) || r.key.toLowerCase().includes(term),
    );
  }
  return filtered;
}

function compatibleSystemIds(
  system: string,
  srdVersion: 'SRD_5.1' | 'SRD_2.0' | undefined,
): Set<string> {
  if (system === 'dnd5e') {
    if (srdVersion === 'SRD_5.1') return new Set(['dnd5e_2014']);
    return new Set(['dnd5e', 'dnd5e_2024']);
  }
  if (system === 'dnd5e_2014') return new Set(['dnd5e_2014']);
  if (system === 'dnd5e_2024') return new Set(['dnd5e', 'dnd5e_2024']);
  return new Set([system]);
}

async function fetchAllPaginated<T>(
  table: 'homebrew_content' | 'imported_content',
  select: string,
  packIds: string[],
  contentType?: string,
): Promise<T[] | null> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from(table)
      .select(select)
      .in('pack_id', packIds);
    if (contentType) q = q.eq('content_type', contentType);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Convert a raw homebrew_content row + its parent pack into the matching
 * `*Result` shape. Returns null for unknown content types so unsupported
 * payloads don't crash the resolver.
 *
 * Exported so the pack detail page can hydrate its own row fetches into
 * the same shapes the SRD/imported tiers use, then pump them through
 * the shared content-table list components.
 */
// Render a structured creature-speed object as the canonical display
// line ("30 ft., fly 60 ft. (hover)"). Walking speed leads when set,
// then non-walking modes in stat-block order. Empty object → "—".
function buildSpeedDisplay(s: NonNullable<HomebrewCreatureData['speeds']>): string {
  const parts: string[] = [];
  if (typeof s.walk === 'number' && s.walk > 0) parts.push(`${s.walk} ft.`);
  if (typeof s.fly === 'number' && s.fly > 0) {
    parts.push(`fly ${s.fly} ft.${s.hover ? ' (hover)' : ''}`);
  }
  if (typeof s.swim === 'number' && s.swim > 0) parts.push(`swim ${s.swim} ft.`);
  if (typeof s.climb === 'number' && s.climb > 0) parts.push(`climb ${s.climb} ft.`);
  if (typeof s.burrow === 'number' && s.burrow > 0) parts.push(`burrow ${s.burrow} ft.`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

export function mapEntryToResult(
  entry: HomebrewContentRow,
  pack: HomebrewPackRow,
): ContentResult | null {
  // Homebrew entries get a stable, content-addressable key derived from
  // their database id. Prefixing with `homebrew_` keeps them distinct
  // from SRD keys (which start with content slugs) and from ever
  // colliding even if two homebrew entries happen to share a name.
  const key = `homebrew_${entry.id}`;
  const base = {
    key,
    name: entry.name,
    tier: 'homebrew' as const,
    system: pack.system,
    // Provenance: the pack the entry belongs to. We use the full pack name
    // for both the compact row badge and the detail label — keeps homebrew
    // visually consistent with SRD entries that show "SRD 2024" rather than
    // a cryptic short code. SourceBadge truncates long names in compact mode.
    importSource: {
      code: pack.name,
      name: pack.name,
    },
    // Homebrew is never tagged with an SRD version — empty array signals
    // "not SRD" cleanly, while still satisfying the *Result.srdVersions
    // shape.
    srdVersions: [] as string[],
    data: {},
  };

  switch (entry.content_type) {
    case 'spell': {
      const d = entry.data as HomebrewSpellData;
      const result: SpellResult = {
        ...base,
        type: 'spell',
        description: d.description ?? '',
        level: d.level ?? 0,
        school: d.school ?? '',
        castingTime: d.castingTime ?? '',
        range: d.range ?? '',
        components: d.components ?? [],
        duration: d.duration ?? '',
        concentration: !!d.concentration,
        ritual: !!d.ritual,
        classes: d.classes ?? [],
      };
      return result;
    }
    case 'creature': {
      const d = entry.data as HomebrewCreatureData;
      // Synthesize a single fallback trait from `traitsNotes` when the
      // structured `traits` array is empty — same migration pattern
      // species uses. Authors who already moved their prose into the
      // structured editor never hit this branch.
      const structuredTraits = d.traits ?? [];
      const traits = structuredTraits.length > 0
        ? structuredTraits
        : d.traitsNotes && d.traitsNotes.trim()
          ? [{ name: 'Traits & Actions', description: d.traitsNotes.trim() }]
          : undefined;
      // Build a display speed string from `speeds` when present so
      // existing UI that reads `speed` keeps working without changes.
      // Legacy `speed` wins when no structured speeds are set.
      const speedDisplay = d.speeds && Object.values(d.speeds).some((v) => v != null && v !== false)
        ? buildSpeedDisplay(d.speeds)
        : (d.speed ?? '30 ft.');
      const result: CreatureResult = {
        ...base,
        type: 'monster',
        description: d.description ?? '',
        challengeRating: d.challengeRating ?? '0',
        size: d.size ?? 'Medium',
        creatureType: d.creatureType ?? '',
        alignment: d.alignment ?? '',
        ac: d.ac ?? 10,
        hp: d.hp ?? 1,
        speed: speedDisplay,
        armorDetail: d.armorDetail,
        hitDice: d.hitDice,
        xp: d.xp,
        proficiencyBonus: d.proficiencyBonus,
        abilityScores: d.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        abilityModifiers: d.abilityScores
          ? {
              str: Math.floor((d.abilityScores.str - 10) / 2),
              dex: Math.floor((d.abilityScores.dex - 10) / 2),
              con: Math.floor((d.abilityScores.con - 10) / 2),
              int: Math.floor((d.abilityScores.int - 10) / 2),
              wis: Math.floor((d.abilityScores.wis - 10) / 2),
              cha: Math.floor((d.abilityScores.cha - 10) / 2),
            }
          : undefined,
        ...(d.speeds ? { speeds: d.speeds } : {}),
        ...(d.savingThrows && Object.keys(d.savingThrows).length > 0
          ? { savingThrows: d.savingThrows } : {}),
        ...(d.skills && Object.keys(d.skills).length > 0
          ? { skills: d.skills } : {}),
        ...(d.senses && Object.values(d.senses).some((v) => v != null)
          ? { senses: d.senses } : {}),
        ...(d.languages ? { languages: d.languages } : {}),
        ...(d.damageResistances && d.damageResistances.length > 0
          ? { damageResistances: d.damageResistances } : {}),
        ...(d.damageImmunities && d.damageImmunities.length > 0
          ? { damageImmunities: d.damageImmunities } : {}),
        ...(d.damageVulnerabilities && d.damageVulnerabilities.length > 0
          ? { damageVulnerabilities: d.damageVulnerabilities } : {}),
        ...(d.conditionImmunities && d.conditionImmunities.length > 0
          ? { conditionImmunities: d.conditionImmunities } : {}),
        ...(traits ? { traits } : {}),
        ...(d.actions && d.actions.length > 0 ? { actions: d.actions } : {}),
        ...(d.environments && d.environments.length > 0 ? { environments: d.environments } : {}),
      };
      return result;
    }
    case 'item': {
      const d = entry.data as HomebrewItemData;
      // Cost: prefer the structured `cost` field; fall back to the
      // legacy `costGold` for rows authored before the structured
      // editor landed. Null when neither is set.
      const cost = d.cost
        ? d.cost
        : typeof d.costGold === 'number'
          ? { amount: d.costGold, currency: 'gp' as const }
          : null;
      const result: ItemResult = {
        ...base,
        type: 'item',
        description: d.description ?? '',
        category: d.category ?? 'adventuring-gear',
        rarity: d.rarity,
        requiresAttunement: !!d.requiresAttunement,
        weight: d.weight,
        cost,
        properties: [
          ...(d.properties ?? []),
          ...(d.requiresAttunement && d.attunementCondition
            ? [`Attunement: ${d.attunementCondition}`]
            : []),
        ],
        ...(d.packContents && d.packContents.length > 0
          ? { packContents: d.packContents }
          : {}),
        data: { magicItemKind: d.magicItemKind ?? null },
      };
      return result;
    }
    case 'feat': {
      const d = entry.data as HomebrewFeatData;
      const result: FeatResult = {
        ...base,
        type: 'feat',
        description: d.description ?? '',
        category: d.category ?? 'general',
        prerequisites: d.prerequisites ?? '',
        benefits: d.benefits ?? [],
      };
      if (d.prerequisitesRaw && d.prerequisitesRaw.length > 0) {
        result.prerequisitesRaw = d.prerequisitesRaw;
      }
      // Pass through player-driven grants (Skilled → 3 skills, etc.).
      // Imported feats with a known shape carry `grants` on
      // `data.grants`; without this passthrough StepFeats never sees
      // the grant and the inline picker doesn't surface.
      if (d.grants) {
        result.grants = d.grants;
      }
      return result;
    }
    case 'class': {
      const d = entry.data as HomebrewClassData;
      const result: ClassResult = {
        ...base,
        type: 'class',
        description: d.description ?? '',
        hitDie: d.hitDie ?? 8,
        primaryAbility: d.primaryAbility ?? [],
        savingThrows: d.savingThrows ?? [],
        armorProficiencies: d.armorProficiencies ?? [],
        weaponProficiencies: d.weaponProficiencies ?? [],
        toolProficiencies: d.toolProficiencies ?? [],
        skillChoices: d.skillChoices ?? { count: 0, from: [] },
        spellcasting: !!d.spellcasting,
        spellcastingAbility: d.spellcastingAbility ?? null,
        subclassUnlockLevel: d.subclassUnlockLevel ?? 3,
      };
      return result;
    }
    case 'species': {
      const d = entry.data as HomebrewSpeciesData;
      // Traits: prefer the structured list; if the author hasn't
      // migrated yet (only `traitsNotes` set on the row), surface
      // the prose as a single "Trait Notes" block so the detail
      // card still renders something.
      const structuredTraits = d.traits ?? [];
      const traits = structuredTraits.length > 0
        ? structuredTraits
        : d.traitsNotes && d.traitsNotes.trim()
          ? [{ name: 'Trait Notes', description: d.traitsNotes.trim() }]
          : [];
      const result: SpeciesResult = {
        ...base,
        type: 'species',
        description: d.description ?? '',
        size: d.size ?? 'Medium',
        speed: d.speed ?? 30,
        traits,
        abilityScoreIncreases: d.abilityScoreIncreases ?? [],
        ...(d.abilityScoreChoices && d.abilityScoreChoices.length > 0
          ? { abilityScoreChoices: d.abilityScoreChoices }
          : {}),
        ...(d.languagesFixed && d.languagesFixed.length > 0
          ? { languagesFixed: d.languagesFixed }
          : {}),
        ...(d.languagesChoices && d.languagesChoices.length > 0
          ? { languagesChoices: d.languagesChoices }
          : {}),
        ...(d.swapRules
          ? { swapRules: {
              abilityScores: d.swapRules.abilityScores ?? false,
              languages: d.swapRules.languages ?? false,
              skills: d.swapRules.skills ?? false,
            } }
          : {}),
      };
      return result;
    }
    case 'background': {
      const d = entry.data as HomebrewBackgroundData;
      const result: BackgroundResult = {
        ...base,
        type: 'background',
        description: d.description ?? '',
        skillProficiencies: d.skillProficiencies ?? [],
        toolProficiency: d.toolProficiency ?? null,
        languages: d.languages ?? 0,
        abilityScoreOptions: d.abilityScoreOptions ?? [],
        originFeat: d.originFeat ?? '',
        // Bridge legacy + structured. Older homebrew rows carry
        // `startingEquipment` as a freeform string — we preserve it
        // under `startingEquipmentText` so the sheet's fallback path
        // can render it. Newly authored rows should set the array.
        startingEquipment: Array.isArray(d.startingEquipment) ? d.startingEquipment : [],
        startingEquipmentText: typeof d.startingEquipment === 'string'
          ? d.startingEquipment
          : null,
      };
      return result;
    }
    case 'subclass': {
      const d = entry.data as HomebrewSubclassData;
      // Same migration pattern as species + creature: prefer structured
      // features; fall back to a single "Features" block synthesized from
      // featuresNotes when the row hasn't been migrated yet.
      const structuredFeatures = d.features ?? [];
      const features = structuredFeatures.length > 0
        ? structuredFeatures
        : d.featuresNotes && d.featuresNotes.trim()
          ? [{ level: d.unlockLevel ?? 3, name: 'Features', description: d.featuresNotes.trim() }]
          : undefined;
      const result: SubclassResult = {
        ...base,
        type: 'subclass',
        description: d.description ?? '',
        parentClassKey: d.parentClassKey ?? '',
        parentClassName: d.parentClassName,
        unlockLevel: d.unlockLevel ?? 3,
        ...(features ? { features } : {}),
        ...(d.progressionColumns ? { progressionColumns: d.progressionColumns } : {}),
        ...(d.progressionTable ? { progressionTable: d.progressionTable } : {}),
        ...(d.spellcasting ? { spellcasting: d.spellcasting } : {}),
        ...(d.spellcastingAbility ? { spellcastingAbility: d.spellcastingAbility } : {}),
        ...(d.casterProgression ? { casterProgression: d.casterProgression } : {}),
        ...(d.spellListClass ? { spellListClass: d.spellListClass } : {}),
      };
      return result;
    }
    case 'optional-feature': {
      const d = entry.data as HomebrewOptionalFeatureData;
      const result: OptionalFeatureResult = {
        ...base,
        type: 'optional-feature',
        description: d.description ?? '',
        kinds: (d.kinds ?? ['other']) as OptionalFeatureKind[],
        prerequisites: d.prerequisites ?? '',
        consumes: d.consumes,
      };
      return result;
    }
    case 'deity': {
      const d = entry.data as HomebrewDeityData;
      const result: DeityResult = {
        ...base,
        type: 'deity',
        pantheon: d.pantheon ?? '',
        title: d.title,
        alignment: d.alignment,
        domains: d.domains,
        symbol: d.symbol,
        plane: d.plane,
        worshipers: d.worshipers,
      };
      return result;
    }
    case 'condition': {
      const d = entry.data as HomebrewConditionData;
      const result: ConditionResult = {
        ...base,
        type: 'condition',
        description: d.description ?? '',
        effects: d.effects ?? [],
      };
      return result;
    }
    default:
      return null;
  }
}

/**
 * Imported entries come in already shaped as `*Result` (the on-device
 * transforms produce them that way). We re-overlay tier/system/key from
 * the parent pack so resolver consumers can't tell the difference between
 * a bundled SRD entry and an imported one — and so the source-book badge
 * shows the imported source (e.g. "PHB"), not the pack name.
 */
export function mapImportedEntryToResult(
  entry: ImportedContentRow,
  pack: HomebrewPackRow,
): ContentResult | null {
  const payload = entry.data as ContentResult | null;
  if (!payload || typeof payload !== 'object') return null;

  // Source provenance: prefer the row-level columns (cheap join, indexable)
  // over re-reading from the payload. Falls through to whatever the payload
  // had if the columns are unset (legacy rows).
  const importSource = entry.source_code
    ? {
        code: entry.source_code,
        name: entry.source_name ?? entry.source_code,
        page: entry.source_page ?? undefined,
      }
    : payload.importSource;

  return {
    ...payload,
    // Imported content lives under the homebrew tier even though it
    // didn't come from the authoring forms — the user-facing "content
    // pack" concept is unified across both.
    tier: 'homebrew',
    // Pack metadata wins over whatever the payload was tagged with at
    // import time (system shouldn't change, but the pack is the
    // authoritative grouping).
    system: pack.system,
    importSource,
  };
}
