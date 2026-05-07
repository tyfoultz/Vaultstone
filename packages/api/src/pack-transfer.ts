// Pack export / import — serialize an entire homebrew pack to a portable
// JSON file and restore it under a new owner.
//
// Use cases:
//   - DM hands a curated pack to a player or another DM out-of-band.
//   - Bug reports / support: attach a repro pack to an issue.
//   - Local backup before risky bulk operations.
//
// Format: `{ format: 'vaultstone-pack/v1', pack, importedEntries, homebrewEntries }`.
// The pack metadata travels alongside, but on import the recipient owns
// the new copy — `id`, `owner_user_id`, timestamps are reissued. There is
// NO sharing back to the sender once exported; this is a one-way file
// handoff, not a synced share.
//
// Legal: pack content travels with the file. Both sides accept the
// per-import ToS callout — the *exporter* attests they had rights to the
// content; the *importer* re-attests they have rights to use it under
// their account. See docs/legal.md.

import { supabase } from './client';
import { getHomebrewPack, createHomebrewPack } from './homebrew-packs';
import { listImportedContent } from './imported-content';
import { listHomebrewEntries } from './homebrew-entries';
import type { Database } from '@vaultstone/types';

type ImportedContentRow   = Database['public']['Tables']['imported_content']['Row'];
type ImportedContentInsert = Database['public']['Tables']['imported_content']['Insert'];
type HomebrewContentRow   = Database['public']['Tables']['homebrew_content']['Row'];
type HomebrewContentInsert = Database['public']['Tables']['homebrew_content']['Insert'];
type HomebrewPackRow      = Database['public']['Tables']['homebrew_packs']['Row'];

/**
 * On-disk format. Versioned so future breaking changes (schema column
 * renames, new tables in the pack scope) can ship a v2 importer that
 * still handles v1 files.
 */
export type PackExportFile = {
  format: 'vaultstone-pack/v1';
  /** Sender-side metadata. Informational — the importer creates a fresh
   *  pack row and may rename it. */
  pack: {
    name: string;
    description: string | null;
    system: string;
    /** Original pack id — included so the file is traceable to its
     *  source if support needs to debug, but never used to upsert. */
    sourceId: string;
    exportedAt: string;
    /** App version that produced the file, when available. Optional —
     *  v1 files don't strictly need it, but it helps support diagnose
     *  schema drift. */
    appVersion?: string;
  };
  /** imported_content rows with row-level identity stripped. The `data`
   *  blob is the producer-shaped *Result payload, so the recipient's
   *  resolver can read it without re-running the 5e.tools transform. */
  importedEntries: Array<Omit<ImportedContentRow,
    'id' | 'pack_id' | 'user_id' | 'imported_at'
  >>;
  /** homebrew_content rows with row-level identity stripped. Authored
   *  entries (the form-driven path) carry the data shapes documented
   *  in @vaultstone/types — we re-use them verbatim. */
  homebrewEntries: Array<Omit<HomebrewContentRow,
    'id' | 'pack_id' | 'user_id' | 'created_at'
  >>;
};

/**
 * Build an export blob for a pack the user can read. RLS already gates
 * read access, so a non-owner DM who has the pack via a shared campaign
 * can also export — that's intentional, since being able to read the
 * content is the rights line. The exported pack identity (owner, id)
 * doesn't travel; the recipient creates their own pack row.
 */
export async function exportHomebrewPack(packId: string): Promise<{
  data: PackExportFile | null;
  error: { message: string } | null;
}> {
  const { data: pack, error: packErr } = await getHomebrewPack(packId);
  if (packErr || !pack) {
    return { data: null, error: packErr ?? { message: 'Pack not found' } };
  }
  const { data: importedRows, error: importedErr } = await listImportedContent(packId);
  if (importedErr) return { data: null, error: importedErr };
  const { data: homebrewRows, error: homebrewErr } = await listHomebrewEntries(packId);
  if (homebrewErr) return { data: null, error: homebrewErr };

  const file: PackExportFile = {
    format: 'vaultstone-pack/v1',
    pack: {
      name: pack.name,
      description: pack.description,
      system: pack.system,
      sourceId: pack.id,
      exportedAt: new Date().toISOString(),
    },
    importedEntries: (importedRows ?? []).map(stripImportedRowIdentity),
    homebrewEntries: (homebrewRows ?? []).map(stripHomebrewRowIdentity),
  };
  return { data: file, error: null };
}

/**
 * Validate that an arbitrary parsed JSON payload is a v1 pack export
 * file. Cheap shape check — we don't deep-validate every row's data
 * blob, since the resolver is already defensive. The check exists to
 * fail fast on user error (picked the wrong file) and to give a
 * specific error message rather than crashing in the upsert.
 */
export function validatePackExportFile(payload: unknown): {
  ok: true;
  file: PackExportFile;
} | {
  ok: false;
  message: string;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'File is not a JSON object.' };
  }
  const obj = payload as Record<string, unknown>;
  if (obj.format !== 'vaultstone-pack/v1') {
    return {
      ok: false,
      message: `Unrecognized format "${String(obj.format)}". Expected "vaultstone-pack/v1".`,
    };
  }
  const pack = obj.pack as Record<string, unknown> | undefined;
  if (!pack || typeof pack !== 'object') {
    return { ok: false, message: 'File is missing the `pack` block.' };
  }
  if (typeof pack.name !== 'string' || typeof pack.system !== 'string') {
    return { ok: false, message: 'Pack metadata is missing required fields (name, system).' };
  }
  if (!Array.isArray(obj.importedEntries) || !Array.isArray(obj.homebrewEntries)) {
    return { ok: false, message: 'File is missing the entries arrays.' };
  }
  return { ok: true, file: payload as PackExportFile };
}

/**
 * Restore an export file under the authenticated user's account. Always
 * creates a NEW pack — there is no merge / overwrite path. If the user
 * wants to update an existing pack, they should delete it and re-import
 * (the row counts make this cheap).
 *
 * Implementation:
 *   1. Insert a fresh homebrew_packs row owned by `userId`.
 *   2. Bulk-insert imported_content rows under the new pack id.
 *   3. Bulk-insert homebrew_content rows under the new pack id.
 *   4. On any failure mid-flight, surface the error. Partial inserts
 *      stay — the user can re-run import after deleting.
 *
 * `userId` must come from the auth store; both inserts have RLS checks
 * keyed on `auth.uid() = user_id`.
 */
export async function importHomebrewPack(args: {
  userId: string;
  file: PackExportFile;
  /** Optional rename — when omitted, the new pack uses the original
   *  name as-is. UI can offer the user a rename field before commit. */
  packNameOverride?: string;
}): Promise<{
  data: { pack: HomebrewPackRow; importedCount: number; homebrewCount: number } | null;
  error: { message: string } | null;
}> {
  const { userId, file, packNameOverride } = args;

  const { data: pack, error: packErr } = await createHomebrewPack({
    ownerUserId: userId,
    system: file.pack.system,
    name: packNameOverride?.trim() || file.pack.name,
    description: file.pack.description,
  });
  if (packErr || !pack) {
    return { data: null, error: packErr ?? { message: 'Failed to create pack row' } };
  }

  let importedCount = 0;
  if (file.importedEntries.length > 0) {
    // Re-stamp pack_id + user_id so the rows land under the recipient.
    // Chunk inserts so a single overweight pack (full PHB ≈ 1500+ rows)
    // doesn't blow the request body limit. PostgREST defaults at ~50MB
    // request, but most edges cap lower; 500 rows per chunk keeps each
    // request comfortably under any realistic ceiling.
    const CHUNK = 500;
    for (let i = 0; i < file.importedEntries.length; i += CHUNK) {
      const slice = file.importedEntries.slice(i, i + CHUNK);
      const rows: ImportedContentInsert[] = slice.map((e) => ({
        pack_id: pack.id,
        user_id: userId,
        content_type: e.content_type,
        name: e.name,
        entry_key: e.entry_key,
        data: e.data,
        source_code: e.source_code,
        source_name: e.source_name,
        source_page: e.source_page,
        source_url: e.source_url,
        source_label: e.source_label,
      }));
      const { error: insertErr, count } = await supabase
        .from('imported_content')
        .insert(rows, { count: 'exact' });
      if (insertErr) {
        return { data: null, error: insertErr };
      }
      importedCount += count ?? slice.length;
    }
  }

  let homebrewCount = 0;
  if (file.homebrewEntries.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < file.homebrewEntries.length; i += CHUNK) {
      const slice = file.homebrewEntries.slice(i, i + CHUNK);
      const rows: HomebrewContentInsert[] = slice.map((e) => ({
        pack_id: pack.id,
        user_id: userId,
        content_type: e.content_type,
        name: e.name,
        data: e.data,
      }));
      const { error: insertErr, count } = await supabase
        .from('homebrew_content')
        .insert(rows, { count: 'exact' });
      if (insertErr) {
        return { data: null, error: insertErr };
      }
      homebrewCount += count ?? slice.length;
    }
  }

  return {
    data: { pack, importedCount, homebrewCount },
    error: null,
  };
}

/**
 * Strip row-level identity (id, pack_id, user_id, timestamps) from an
 * imported_content row so it ports cleanly to a new pack/owner. The
 * remaining fields fully describe the entry's payload + provenance.
 */
function stripImportedRowIdentity(
  row: ImportedContentRow,
): PackExportFile['importedEntries'][number] {
  // Destructure to exclude identity columns, keeping the rest verbatim.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, pack_id, user_id, imported_at, ...rest } = row;
  return rest;
}

function stripHomebrewRowIdentity(
  row: HomebrewContentRow,
): PackExportFile['homebrewEntries'][number] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, pack_id, user_id, created_at, ...rest } = row;
  return rest;
}
