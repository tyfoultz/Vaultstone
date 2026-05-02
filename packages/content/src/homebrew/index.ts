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
  campaign_id: string | null;
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
  // SRD version filter immediately excludes homebrew — homebrew is by
  // definition not SRD. Bail before any network calls.
  if (query.srdVersion) return [];

  // Build the optional campaign-scoped pack allowlist before fetching the
  // entries. When `query.campaignId` is set we restrict to packs whose
  // campaign_packs row exists with enabled=true. Players in a campaign
  // see only what the DM has approved; the DM's own private packs that
  // aren't attached are not surfaced even though RLS would let them be
  // read.
  let allowedPackIds: Set<string> | null = null;
  if (query.campaignId) {
    const { data: enabled, error: enabledErr } = await supabase
      .from('campaign_packs')
      .select('pack_id')
      .eq('campaign_id', query.campaignId)
      .eq('enabled', true);
    if (enabledErr) return [];
    allowedPackIds = new Set((enabled ?? []).map((r) => r.pack_id));
    // Empty allowlist short-circuits — no homebrew applies to this campaign.
    if (allowedPackIds.size === 0) return [];
  }

  // Fetch packs + entries in parallel. Both are RLS-gated; missing auth
  // just returns 0 rows, no error.
  const [packsRes, entriesRes] = await Promise.all([
    supabase.from('homebrew_packs').select('id, owner_user_id, campaign_id, system, name'),
    supabase.from('homebrew_content').select('id, user_id, pack_id, content_type, name, data'),
  ]);

  if (packsRes.error || entriesRes.error) return [];

  const packs = (packsRes.data ?? []) as HomebrewPackRow[];
  const entries = (entriesRes.data ?? []) as HomebrewContentRow[];
  const packById = new Map(packs.map((p) => [p.id, p]));

  const results: ContentResult[] = [];
  for (const entry of entries) {
    if (!entry.pack_id) continue; // legacy rows without a pack are skipped
    if (allowedPackIds && !allowedPackIds.has(entry.pack_id)) continue;
    const pack = packById.get(entry.pack_id);
    if (!pack) continue;
    const mapped = mapEntryToResult(entry, pack);
    if (mapped) results.push(mapped);
  }

  // Apply remaining filters in-memory.
  let filtered = results;
  if (query.system) {
    filtered = filtered.filter((r) => r.system === query.system);
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

/**
 * Convert a raw homebrew_content row + its parent pack into the matching
 * `*Result` shape. Returns null for unknown content types so unsupported
 * payloads don't crash the resolver.
 */
function mapEntryToResult(
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
