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
 * Bulk upsert entries into a pack. `entry_key` is the conflict target —
 * re-importing the same source file replaces matching entries in place
 * rather than duplicating, so the user can re-run an import to pick up
 * source updates without manual cleanup.
 *
 * `userId` must come from the auth store; the row-insert RLS policy
 * checks `auth.uid() = user_id`.
 */
export async function upsertImportedEntries(args: {
  packId: string;
  userId: string;
  entries: ImportedEntryInput[];
}) {
  const { packId, userId, entries } = args;
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
  }));

  return supabase
    .from('imported_content')
    .upsert(rows, { onConflict: 'pack_id,entry_key' })
    .select();
}

/**
 * Delete every imported entry in a pack. Used when the user removes a
 * pack — the homebrew_packs CASCADE handles imported_content rows too,
 * but this is here for surgical "drop the imported entries but keep the
 * pack" flows (e.g. a future re-import that wants to wipe-then-reimport
 * rather than upsert).
 */
export async function deleteImportedEntriesInPack(packId: string) {
  return supabase
    .from('imported_content')
    .delete()
    .eq('pack_id', packId);
}

export type { ImportedContentRow };
