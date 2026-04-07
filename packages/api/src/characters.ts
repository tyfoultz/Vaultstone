import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type CharacterInsert = Database['public']['Tables']['characters']['Insert'];

export async function getCharacters(campaignId: string) {
  return supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId);
}

export async function createCharacter(character: CharacterInsert) {
  return supabase
    .from('characters')
    .insert(character)
    .select()
    .single();
}

export async function updateCharacter(
  id: string,
  updates: Database['public']['Tables']['characters']['Update']
) {
  return supabase
    .from('characters')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
}
