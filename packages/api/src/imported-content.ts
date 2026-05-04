// CRUD for imported_content rows. Imported entries belong to the same
// homebrew_packs parent table as authored homebrew (one unified pack
// concept) but live in a separate table because the data shapes differ —
// imported entries carry the full *Result-shaped payload from the
// on-device transforms, while homebrew_content uses the user-authored
// form schema with intentional gaps for free-form prose.
//
// See packages/content/src/imported/transform/* for the producers and
// supabase/migrations/20260517000000_imported_content.sql for the schema.

import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type ImportedContentRow = Database['public']['Tables']['imported_content']['Row'];
type ImportedContentInsert = Database['public']['Tables']['imported_content']['Insert'];

/**
 * One imported entry as it gets written to imported_content. The `data`
 * field carries the full *Result payload from the transform — the read
 * path can deserialize it directly into the matching SubclassResult /
 * SpellResult / etc. without re-mapping.
 */
export type ImportedEntryInput = {
  contentType: string;
  name: string;
  /** Stable key derived from systemId + source + name; collisions on
   *  re-import are upserted in place, not duplicated. */
  entryKey: string;
  /** Pre-shaped *Result payload from the transform layer. */
  data: unknown;
  sourceCode?: string;
  sourceName?: string;
  sourcePage?: number;
  sourceUrl?: string;
};

/**
 * Per-card summary derived from imported_content rows. One card per
 * (pack_id, source_label) — the user's named import unit inside a pack.
 */
export type ImportedSourceCard = {
  sourceLabel: string;
  /** Source filename (most recent imported_at row) — informational only. */
  sourceUrl: string | null;
  importedAt: string;
  entryCount: number;
  contentTypeCounts: Record<string, number>;
};

/**
 * List every imported entry under a pack. Used by the homebrew tier
 * resolver to merge imported entries with authored ones under the same
 * pack umbrella.
 */
export async function listImportedContent(packId: string) {
  return supabase
    .from('imported_content')
    .select('*')
    .eq('pack_id', packId)
    .order('imported_at', { ascending: true });
}

/**
 * List imported entries across every pack the authenticated user can
 * read for a given system. RLS already scopes the rows; we just join to
 * homebrew_packs to filter by `system`. Used by the homebrew resolver
 * to fan in imports alongside authored content.
 */
export async function listImportedContentForSystem(systemId: string) {
  return supabase
    .from('imported_content')
    .select('*, homebrew_packs!inner(system)')
    .eq('homebrew_packs.system', systemId);
}

/**
 * Bulk upsert entries into a pack under a specific user-given
 * `sourceLabel` (the "card" inside the pack). `(pack_id, source_label,
 * entry_key)` is the conflict target — re-importing the same source
 * file with the same label replaces matching entries in place rather
 * than duplicating, so the user can re-run an import to pick up source
 * updates without manual cleanup. Re-importing with a *different*
 * label creates a separate card.
 *
 * `userId` must come from the auth store; the row-insert RLS policy
 * checks `auth.uid() = user_id`.
 */
export async function upsertImportedEntries(args: {
  packId: string;
  userId: string;
  sourceLabel: string;
  entries: ImportedEntryInput[];
}) {
  const { packId, userId, sourceLabel, entries } = args;
  if (entries.length === 0) return { data: [], error: null };

  const rows: ImportedContentInsert[] = entries.map((e) => ({
    pack_id: packId,
    user_id: userId,
    content_type: e.contentType,
    name: e.name,
    entry_key: e.entryKey,
    data: e.data as Database['public']['Tables']['imported_content']['Insert']['data'],
    source_code: e.sourceCode ?? null,
    source_name: e.sourceName ?? null,
    source_page: e.sourcePage ?? null,
    source_url: e.sourceUrl ?? null,
    source_label: sourceLabel,
  }));

  return supabase
    .from('imported_content')
    .upsert(rows, { onConflict: 'pack_id,source_label,entry_key' })
    .select();
}

/**
 * Delete every imported entry under a specific `sourceLabel` inside a
 * pack — the surgical "drop this card, keep the rest of the pack" flow.
 * Used by the pack detail page's "Remove import" action and by
 * re-imports that want to wipe-then-reimport rather than upsert
 * (avoiding stale entries when a source file shrinks across imports).
 */
export async function deleteImportedEntriesBySourceLabel(packId: string, sourceLabel: string) {
  return supabase
    .from('imported_content')
    .delete()
    .eq('pack_id', packId)
    .eq('source_label', sourceLabel);
}

/**
 * Build per-card summaries for a pack — one entry per distinct
 * `source_label`. Used by the pack detail page to render the "Imported
 * sources" card grid (label + filename + import date + per-type counts).
 */
export async function listImportedSourceCards(packId: string): Promise<{
  data: ImportedSourceCard[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from('imported_content')
    .select('source_label, source_url, content_type, imported_at')
    .eq('pack_id', packId);
  if (error) return { data: null, error };

  const byLabel = new Map<string, ImportedSourceCard>();
  for (const row of data ?? []) {
    const label = row.source_label;
    let card = byLabel.get(label);
    if (!card) {
      card = {
        sourceLabel: label,
        sourceUrl: row.source_url,
        importedAt: row.imported_at,
        entryCount: 0,
        contentTypeCounts: {},
      };
      byLabel.set(label, card);
    }
    // Keep the most recent imported_at + the source_url paired with it
    // so the card subtitle reflects the latest import of that label.
    if (row.imported_at > card.importedAt) {
      card.importedAt = row.imported_at;
      card.sourceUrl = row.source_url;
    }
    card.entryCount += 1;
    card.contentTypeCounts[row.content_type] = (card.contentTypeCounts[row.content_type] ?? 0) + 1;
  }
  return { data: [...byLabel.values()].sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel)), error: null };
}

export type { ImportedContentRow };
