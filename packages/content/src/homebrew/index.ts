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

/**
 * Fetch all homebrew entries the authenticated user can read (RLS handles
 * the access check) and shape them into `*Result` records that look
 * indistinguishable from SRD content to downstream consumers. Filtering
 * by `query.system`, `query.type`, `query.search`, etc. happens after the
 * fetch — the dataset is small (a user's own packs), so a single
 * round-trip + in-memory filter is simpler than building dynamic SQL.
 *
 * Returns an empty array on auth failure or query error rather than
 * throwing — homebrew is additive content, and the SRD tier should still
 * surface even if the network is flaky.
 */
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

  // Fetch packs with server-side system filter so the subsequent entry
  // queries only touch packs for the requested game system.  Previously
  // the system filter was applied in-memory after pulling every row the
  // user can read — with 9k+ imported_content rows that meant ~20 MB of
  // JSONB per resolver call and frequent PostgREST timeouts.
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

  const [authored, imported] = await Promise.all([
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
        startingEquipment: d.startingEquipment ?? null,
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
