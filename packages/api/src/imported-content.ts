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
  /** Count of rows in this card whose `data.fluffSource` is set —
   *  the user has layered class-flavor prose on top of structured
   *  imports. 0 means "no flavor patches applied to this card". */
  fluffPatchCount: number;
  /** Filename of the most recent fluff import that touched this card,
   *  for display in the badge tooltip / detail row. */
  fluffSourceName: string | null;
};

/**
 * List every imported entry under a pack. Used by the homebrew tier
 * resolver to merge imported entries with authored ones under the same
 * pack umbrella.
 *
 * Paginates in 1000-row chunks because Supabase's default `.select()`
 * caps responses at 1000 rows. Packs holding a full 2024 PHB import
 * easily exceed that (bestiary alone is 500+ creatures), so the cap
 * silently truncated the entries list before this fix.
 */
export async function listImportedContent(packId: string) {
  const PAGE = 1000;
  const out: ImportedContentRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('imported_content')
      .select('*')
      .eq('pack_id', packId)
      .order('imported_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: null, error };
    const rows = (data ?? []) as ImportedContentRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out, error: null };
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
 * Patch the `description` field on existing imported entries within a
 * pack, keyed by `entry_key`. Used by the fluff-file import path: a
 * 5e.tools `fluff-class-*.json` doesn't carry the structured class
 * definition, only flavor prose, so it can't go through the regular
 * upsert (which would replace the whole row). Instead we look up the
 * existing row by entry_key and merge a new `description` into the
 * existing `data` JSON blob.
 *
 * Patches rows belonging to any source_label inside the pack. The
 * fluff file is typically a separate filename from the class file
 * the user already imported, so we deliberately ignore source_label
 * when matching.
 */
export async function patchImportedDescriptions(args: {
  packId: string;
  patches: Array<{ entryKey: string; description: string }>;
  /** Optional provenance stamped into each patched row's `data.fluffSource`.
   *  Surfaced in pack source-card grids so users can see which cards
   *  have flavor prose layered on top of their structured imports. */
  fluffSource?: { fileName: string; sourceLabel: string };
}): Promise<{ patched: number; error: { message: string } | null }> {
  const { packId, patches, fluffSource } = args;
  if (patches.length === 0) return { patched: 0, error: null };

  // Fetch existing rows so we can merge into the JSON `data` blob.
  // Supabase doesn't have a native "set one nested JSON field" op, so
  // we read-modify-write per entry. Volume is small (one fluff file =
  // tens of entries), so the round-trip cost is acceptable.
  const entryKeys = patches.map((p) => p.entryKey);
  const { data: rows, error: readErr } = await supabase
    .from('imported_content')
    .select('id, entry_key, data')
    .eq('pack_id', packId)
    .in('entry_key', entryKeys);
  if (readErr) return { patched: 0, error: readErr };

  const byKey = new Map<string, { id: string; data: unknown }>();
  for (const row of rows ?? []) {
    byKey.set(row.entry_key, { id: row.id, data: row.data });
  }

  let patched = 0;
  for (const patch of patches) {
    const row = byKey.get(patch.entryKey);
    if (!row) continue; // no matching entry; user imported fluff before class
    const merged: Record<string, unknown> = {
      ...(row.data as Record<string, unknown>),
      description: patch.description,
    };
    if (fluffSource) {
      merged.fluffSource = fluffSource;
    }
    const { error } = await supabase
      .from('imported_content')
      .update({ data: merged as Database['public']['Tables']['imported_content']['Update']['data'] })
      .eq('id', row.id);
    if (error) return { patched, error };
    patched++;
  }
  return { patched, error: null };
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
 *
 * Paginates in 1000-row chunks so packs that exceed Supabase's default
 * `.select()` cap (e.g. a single "2024 Core" pack with all classes +
 * bestiary + spells = 1,700+ rows) still produce complete card lists.
 */
export async function listImportedSourceCards(packId: string): Promise<{
  data: ImportedSourceCard[] | null;
  error: { message: string } | null;
}> {
  const PAGE = 1000;
  const byLabel = new Map<string, ImportedSourceCard>();
  for (let offset = 0; ; offset += PAGE) {
    // Pull `data` so we can read the optional `fluffSource` field
    // stamped onto class/subclass rows by patchImportedDescriptions.
    // Volume note: data blobs run 1-3 KB per row, so a 700-row pack
    // pulls ~2 MB total — acceptable for the rare card-grid render.
    const { data, error } = await supabase
      .from('imported_content')
      .select('source_label, source_url, content_type, imported_at, data')
      .eq('pack_id', packId)
      .range(offset, offset + PAGE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    for (const row of rows) {
      const label = row.source_label;
      let card = byLabel.get(label);
      if (!card) {
        card = {
          sourceLabel: label,
          sourceUrl: row.source_url,
          importedAt: row.imported_at,
          entryCount: 0,
          contentTypeCounts: {},
          fluffPatchCount: 0,
          fluffSourceName: null,
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
      // Fluff patches stamp `data.fluffSource = { fileName, sourceLabel }`
      // onto the row. Count them per card and remember the most-recent
      // fluff filename for the badge tooltip.
      const fluffSource = (row.data as { fluffSource?: { fileName?: string } } | null)?.fluffSource;
      if (fluffSource && typeof fluffSource.fileName === 'string') {
        card.fluffPatchCount += 1;
        card.fluffSourceName = fluffSource.fileName;
      }
    }
    if (rows.length < PAGE) break; // last page
  }
  return { data: [...byLabel.values()].sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel)), error: null };
}

export type { ImportedContentRow };
