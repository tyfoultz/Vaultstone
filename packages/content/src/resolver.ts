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
 *   2. Local     — user-uploaded PDFs indexed in device SQLite, never transmitted
 *   3. Imported  — user-imported JSON content packs (e.g. from 5e.tools), on-device only
 *   4. Homebrew  — user-created content stored in Supabase
 *
 * When the same logical entry exists in multiple tiers, the higher-priority
 * tier wins — see TIER_PRIORITY below. Callers never need to know which tier
 * responded.
 */
export class ContentResolver {
  static async search(query: ContentQuery): Promise<ContentResult[]> {
    const tiers = query.tiers ?? ['srd', 'local', 'imported', 'homebrew'];
    const results: ContentResult[] = [];

    if (tiers.includes('srd')) {
      const srd = await import('./srd/index');
      results.push(...srd.search(query));
    }

    if (tiers.includes('local')) {
      const local = await import('./local/index');
      results.push(...(await local.search(query)));
    }

    if (tiers.includes('imported')) {
      const imported = await import('./imported/index');
      results.push(...(await imported.search(query)));
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
 * Higher number wins when two entries collide. Imported beats SRD because
 * the imported version is typically the more complete, book-accurate one
 * (the SRD is a deliberately stripped subset). Homebrew wins overall so a
 * user's authored override always takes precedence over bundled content.
 */
const TIER_PRIORITY: Record<ContentTier, number> = {
  srd: 1,
  local: 2,
  imported: 3,
  homebrew: 4,
};

/**
 * Two entries are "the same" if they share `(type, lowercased name)`. Keys
 * differ across tiers (SRD uses content slugs, imported uses a different
 * scheme, homebrew prefixes with `homebrew_`), so name-based dedupe is the
 * only thing that lets us collapse a PHB Berserker against the SRD one.
 */
function deduplicate(results: ContentResult[]): ContentResult[] {
  const winners = new Map<string, ContentResult>();
  for (const r of results) {
    const dedupKey = `${r.type}:${r.name.toLowerCase()}`;
    const incumbent = winners.get(dedupKey);
    if (!incumbent || TIER_PRIORITY[r.tier] > TIER_PRIORITY[incumbent.tier]) {
      winners.set(dedupKey, r);
    }
  }
  return [...winners.values()];
}
