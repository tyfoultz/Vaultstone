// CRUD for individual homebrew_content rows scoped to a pack.
//
// The earlier homebrew.ts API was campaign-scoped (legacy from before packs
// existed). This module is the pack-scoped path the authoring forms use:
// every entry must belong to a pack. The `data` jsonb column stores one of
// the HomebrewSpellData / HomebrewCreatureData / etc. shapes; the parent
// pack's RLS policies cascade to entries via the existing
// homebrew_content owner check.

import { supabase } from './client';
import type {
  Database,
  HomebrewContentType,
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

type HomebrewContentRow = Database['public']['Tables']['homebrew_content']['Row'];
type HomebrewContentInsert = Database['public']['Tables']['homebrew_content']['Insert'];
type HomebrewContentUpdate = Database['public']['Tables']['homebrew_content']['Update'];

/**
 * Author-shape union — what the form layer hands us. The CRUD wrappers
 * stringify this into the row's `data` jsonb column.
 */
export type HomebrewEntryDataInput =
  | { contentType: 'spell';            data: HomebrewSpellData }
  | { contentType: 'creature';         data: HomebrewCreatureData }
  | { contentType: 'item';             data: HomebrewItemData }
  | { contentType: 'feat';             data: HomebrewFeatData }
  | { contentType: 'class';            data: HomebrewClassData }
  | { contentType: 'species';          data: HomebrewSpeciesData }
  | { contentType: 'background';       data: HomebrewBackgroundData }
  | { contentType: 'subclass';         data: HomebrewSubclassData }
  | { contentType: 'optional-feature'; data: HomebrewOptionalFeatureData }
  | { contentType: 'deity';            data: HomebrewDeityData }
  | { contentType: 'condition';        data: HomebrewConditionData };

export async function listHomebrewEntries(packId: string) {
  return supabase
    .from('homebrew_content')
    .select('*')
    .eq('pack_id', packId)
    .order('created_at', { ascending: true });
}

export async function getHomebrewEntry(entryId: string) {
  return supabase
    .from('homebrew_content')
    .select('*')
    .eq('id', entryId)
    .single();
}

/**
 * Create an entry inside a pack. Caller passes the form-authored payload;
 * we attach the row-level metadata (user_id, pack_id, content_type, name).
 *
 * `userId` must come from the auth store — the row-insert RLS policy
 * checks `auth.uid() = user_id`, so a wrong value rejects.
 *
 * Sharing follows from the parent pack: a campaign member can read this
 * entry iff the pack is enabled on a campaign they're in. There is no
 * per-entry campaign or publish flag anymore — the column was dropped
 * along with homebrew_packs.campaign_id and is_published.
 */
export async function createHomebrewEntry(input: {
  userId: string;
  packId: string;
  name: string;
  payload: HomebrewEntryDataInput;
}) {
  const row: HomebrewContentInsert = {
    user_id: input.userId,
    pack_id: input.packId,
    name: input.name,
    content_type: input.payload.contentType,
    // Cast through unknown — the Database type's `data: Json` is too loose
    // to accept our discriminated unions directly, but the runtime shape
    // is exactly what the consumer will deserialize.
    data: input.payload.data as unknown as Database['public']['Tables']['homebrew_content']['Insert']['data'],
  };
  return supabase
    .from('homebrew_content')
    .insert(row)
    .select()
    .single();
}

/**
 * Update an existing entry. `name` and `data` are independently optional —
 * pass only the fields that changed. Content type is fixed once an entry
 * is created (changing it would break the data shape contract); use
 * delete + create to "convert" an entry.
 */
export async function updateHomebrewEntry(entryId: string, patch: {
  name?: string;
  data?:
    | HomebrewSpellData | HomebrewCreatureData | HomebrewItemData
    | HomebrewFeatData | HomebrewClassData | HomebrewSpeciesData
    | HomebrewBackgroundData | HomebrewSubclassData
    | HomebrewOptionalFeatureData | HomebrewDeityData | HomebrewConditionData;
}) {
  const update: HomebrewContentUpdate = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.data !== undefined) {
    update.data = patch.data as unknown as Database['public']['Tables']['homebrew_content']['Update']['data'];
  }
  return supabase
    .from('homebrew_content')
    .update(update)
    .eq('id', entryId)
    .select()
    .single();
}

export async function deleteHomebrewEntry(entryId: string) {
  return supabase
    .from('homebrew_content')
    .delete()
    .eq('id', entryId);
}

export type { HomebrewContentRow, HomebrewContentType };
