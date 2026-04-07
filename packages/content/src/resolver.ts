import type {
  ContentResult,
  ContentQuery,
  SpellResult,
  CreatureResult,
} from '@vaultstone/types';

/**
 * ContentResolver — unified query interface for all content tiers.
 *
 * Tiers (resolved in order, results merged):
 *   1. SRD — bundled with the app, always available offline
 *   2. Local — user-uploaded PDFs indexed in device SQLite, never transmitted
 *   3. Homebrew — user-created content stored in Supabase
 *
 * Callers never need to know which tier responded.
 */
export class ContentResolver {
  static async search(query: ContentQuery): Promise<ContentResult[]> {
    const tiers = query.tiers ?? ['srd', 'local', 'homebrew'];
    const results: ContentResult[] = [];

    if (tiers.includes('srd')) {
      const srd = await import('./srd/index');
      results.push(...srd.search(query));
    }

    if (tiers.includes('local')) {
      const local = await import('./local/index');
      results.push(...(await local.search(query)));
    }

    if (tiers.includes('homebrew')) {
      const homebrew = await import('./homebrew/index');
      results.push(...(await homebrew.search(query)));
    }

    return deduplicateByKey(results);
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

function deduplicateByKey(results: ContentResult[]): ContentResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}
