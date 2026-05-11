// Homebrew content reader. The user's homebrew_content rows live in
// Supabase, scoped to packs (homebrew_packs) which are themselves tagged
// to a game system. ContentResolver delegates to this module's `search`
// at query time; we fetch the user's accessible packs + their entries
// and map each row's `data` jsonb to the matching `*Result` shape so the
// rest of the app (Game Systems tabs, character creation, etc.) doesn't
// need to know homebrew has a different storage path than SRD.

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
  HomebrewSpellData,
  HomebrewCreatureData,
  HomebrewItemData,
  HomebrewFeatData,
  HomebrewClassData,
  HomebrewSpeciesData,
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
let _entryCache: {
  key: string;
  packs: HomebrewPackRow[];
  authored: HomebrewContentRow[];
  imported: ImportedContentRow[];
  fetchedAt: number;
} | null = null;
const ENTRY_CACHE_TTL = 30_000;

export function invalidateHomebrewCache() {
  _entryCache = null;
}

export async function search(query: ContentQuery): Promise<ContentResult[]> {
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
  const relevantPacks = allowedPackIds
    ? packs.filter((p) => allowedPackIds!.has(p.id))
    : packs;
  if (relevantPacks.length === 0) return [];
  const relevantPackIds = relevantPacks.map((p) => p.id);

  const cacheKey = [...relevantPackIds].sort().join(',');
  let authored: HomebrewContentRow[] | null;
  let imported: ImportedContentRow[] | null;

  if (
    _entryCache
    && _entryCache.key === cacheKey
    && Date.now() - _entryCache.fetchedAt < ENTRY_CACHE_TTL
  ) {
    authored = _entryCache.authored;
    imported = _entryCache.imported;
  } else {
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
      _entryCache = { key: cacheKey, packs: relevantPacks, authored, imported, fetchedAt: Date.now() };
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
): Promise<T[] | null> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in('pack_id', packIds)
      .range(offset, offset + PAGE - 1);
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
        speed: d.speed ?? '30 ft.',
        armorDetail: d.armorDetail,
        hitDice: d.hitDice,
        xp: d.xp,
        abilityScores: d.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      };
      return result;
    }
    case 'item': {
      const d = entry.data as HomebrewItemData;
      const result: ItemResult = {
        ...base,
        type: 'item',
        description: d.description ?? '',
        category: d.category ?? 'adventuring-gear',
        rarity: d.rarity,
        requiresAttunement: !!d.requiresAttunement,
        weight: d.weight,
        cost: typeof d.costGold === 'number'
          ? { amount: d.costGold, currency: 'gp' }
          : null,
        properties: [
          ...(d.properties ?? []),
          ...(d.requiresAttunement && d.attunementCondition
            ? [`Attunement: ${d.attunementCondition}`]
            : []),
        ],
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
      const result: SpeciesResult = {
        ...base,
        type: 'species',
        description: d.description ?? '',
        size: d.size ?? 'Medium',
        speed: d.speed ?? 30,
        traits: [],
        abilityScoreIncreases: [],
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
