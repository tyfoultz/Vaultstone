import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type CharacterInsert = Database['public']['Tables']['characters']['Insert'];
type CharacterUpdate = Database['public']['Tables']['characters']['Update'];

export async function getCharacters(campaignId: string) {
  return supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId);
}

/** Fetch all characters owned by the currently authenticated user. */
export async function getMyCharacters() {
  return supabase
    .from('characters')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function createCharacter(character: CharacterInsert) {
  return supabase
    .from('characters')
    .insert(character)
    .select()
    .single();
}

export async function getCharacterById(id: string) {
  return supabase
    .from('characters')
    .select('*')
    .eq('id', id)
    .single();
}

export async function updateCharacter(id: string, updates: CharacterUpdate) {
  return supabase
    .from('characters')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
}

// Read-modify-write for resources.hpCurrent — the column is JSON, so we
// merge rather than overwrite sibling fields (hpTemp, hitDice, etc.).
export async function updateCharacterHp(characterId: string, hpCurrent: number) {
  const { data: char, error: readError } = await supabase
    .from('characters').select('resources').eq('id', characterId).single();
  if (readError || !char) return { error: readError ?? new Error('Character not found') };
  const resources = { ...(char.resources as Record<string, unknown>), hpCurrent };
  return supabase.from('characters').update({ resources }).eq('id', characterId);
}

export async function updateCharacterConditions(characterId: string, conditions: string[]) {
  return supabase.from('characters').update({ conditions }).eq('id', characterId);
}
