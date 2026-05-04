// CRUD for in-progress character drafts. The character creation wizard
// stores its working state in a Zustand-persisted store (working memory);
// when the user taps "Save draft" we snapshot that working memory into a
// row here so they can resume on any device, and the wizard reset on a
// fresh launch doesn't wipe their progress.
//
// Schema notes:
//   - `data` is jsonb shaped like packages/store/src/character-draft.store.ts's
//     `CharacterDraft`. We don't validate the shape server-side — the wizard
//     is the only writer, and a malformed draft just won't restore cleanly.
//   - RLS scopes everything to the owner; see the migration for policies.

import { supabase } from './client';
import type { Database, Json } from '@vaultstone/types';

export type CharacterDraftRow = Database['public']['Tables']['character_drafts']['Row'];
type CharacterDraftInsert = Database['public']['Tables']['character_drafts']['Insert'];

/**
 * List the authenticated user's drafts. RLS already scopes to owner;
 * `user_id` filter is redundant but lets the query plan use the index
 * without relying on the policy's exists-check.
 */
export async function listCharacterDrafts() {
  return supabase
    .from('character_drafts')
    .select('*')
    .order('updated_at', { ascending: false });
}

export async function getCharacterDraft(draftId: string) {
  return supabase
    .from('character_drafts')
    .select('*')
    .eq('id', draftId)
    .single();
}

/**
 * Create a new draft row. Caller passes the wizard's working state as
 * `data` and a derived display `name` (typically `characterName` if set,
 * otherwise null — UI falls back to "Untitled draft").
 */
export async function createCharacterDraft(input: {
  userId: string;
  name: string | null;
  data: Json;
}) {
  const row: CharacterDraftInsert = {
    user_id: input.userId,
    name: input.name,
    data: input.data,
  };
  return supabase
    .from('character_drafts')
    .insert(row)
    .select()
    .single();
}

/**
 * Update an existing draft. The wizard calls this on every "Save draft"
 * after the first save so a single in-progress draft updates in place
 * rather than spawning duplicates. Skip undefined fields so the caller
 * can patch just the bits that changed.
 */
export async function updateCharacterDraft(
  draftId: string,
  patch: { name?: string | null; data?: Json },
) {
  const update: Database['public']['Tables']['character_drafts']['Update'] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.data !== undefined) update.data = patch.data;
  return supabase
    .from('character_drafts')
    .update(update)
    .eq('id', draftId)
    .select()
    .single();
}

export async function deleteCharacterDraft(draftId: string) {
  return supabase
    .from('character_drafts')
    .delete()
    .eq('id', draftId);
}
