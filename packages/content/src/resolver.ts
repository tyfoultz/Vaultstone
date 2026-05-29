import type {
  ContentResult,
  ContentQuery,
  ContentTier,
  SpellResult,
  CreatureResult,
} from '@vaultstone/types';

/**
 * ContentResolver — unified query interface for all content tiers.
 *
 * Tiers (resolved in order, results merged):
 *   1. SRD       — bundled with the app, always available offline
 *   2. Homebrew  — user-created or user-imported content stored in Supabase
 *
 * When the same logical entry exists in multiple tiers, the higher-priority
 * tier wins — see TIER_PRIORITY below. Callers never need to know which tier
 * responded.
 *
 * The 'local' tier is preserved in the ContentTier union for the storage
 * layer (PDF uploads still use LocalSource), but it does not contribute
 * search results. JSON imports were merged into the homebrew tier in M1
 * of the imported-content unification — they share the homebrew_packs
 * parent table; the homebrew resolver fetches their entries from the
 * separate imported_content table and surfaces them under the same
 * pack umbrella.
 */
export class ContentResolver {
  static async search(query: ContentQuery): Promise<ContentResult[]> {
    const tiers = query.tiers ?? ['srd', 'homebrew'];
    const results: ContentResult[] = [];

    if (tiers.includes('srd')) {
      const srd = await import('./srd/index');
      results.push(...srd.search(query));
    }

    if (tiers.includes('homebrew')) {
      const homebrew = await import('./homebrew/index');
      results.push(...(await homebrew.search(query)));
    }

    return deduplicate(results);
  }

  static async getByKey(contentKey: string): Promise<ContentResult | null> {
    const results = await this.search({ search: contentKey });
    return results.find((r) => r.key === contentKey) ?? null;
  }

  static async getSpell(name: string, source?: string): Promise<SpellResult | null> {
    const results = await this.search({ search: name, type: 'spell' });
    const match = results.find((r) =>
      r.name.toLowerCase() === name.toLowerCase() &&
      (source ? r.tier === source : true)
    );
    return (match as SpellResult) ?? null;
  }

  static async getCreature(name: string, source?: string): Promise<CreatureResult | null> {
    const results = await this.search({ search: name, type: 'monster' });
    const match = results.find((r) =>
      r.name.toLowerCase() === name.toLowerCase() &&
      (source ? r.tier === source : true)
    );
    return (match as CreatureResult) ?? null;
  }
}

/**
 * Higher number wins when two entries collide. Homebrew (which now also
 * carries imported entries) beats SRD because the user-supplied version
 * is typically the more complete, book-accurate one — the SRD is a
 * deliberately stripped subset, and imported content under the homebrew
 * tier carries the rich payload from the on-device transforms.
 *
 * The 'local' tier produces no search results (PDF storage only) but stays
 * in the table at neutral priority so dedupe code stays type-safe.
 */
const TIER_PRIORITY: Record<ContentTier, number> = {
  srd: 1,
  local: 1,
  homebrew: 4,
  // 'imported' is retained in the type union for now (legacy callers may
  // still pass it in `tiers`); it's a no-op since the resolver doesn't
  // dispatch to it. Treated at homebrew priority so any incoming
  // imported-tier results dedupe correctly with homebrew.
  imported: 4,
};

/**
 * Collapse duplicate entries across tiers so a homebrew "Goblin" replaces
 * the SRD one. Within the same tier, per-edition variants (different `key`
 * values like `remorhaz-srd-5-1` vs `remorhaz-srd-2-0`) are kept — they
 * represent mechanically distinct stat blocks.
 */
function deduplicate(results: ContentResult[]): ContentResult[] {
  const byName = new Map<string, ContentResult[]>();
  for (const r of results) {
    const dedupKey = `${r.type}:${r.name.toLowerCase()}`;
    const group = byName.get(dedupKey);
    if (group) group.push(r);
    else byName.set(dedupKey, [r]);
  }
  const out: ContentResult[] = [];
  for (const group of byName.values()) {
    const maxPriority = Math.max(...group.map((r) => TIER_PRIORITY[r.tier]));
    for (const r of group) {
      if (TIER_PRIORITY[r.tier] === maxPriority) out.push(r);
    }
  }
  return out;
}
