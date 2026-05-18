import { supabase } from './client';
import type { EncounterCombatant } from '@vaultstone/types';

export async function getEncounters(campaignId: string) {
  return supabase
    .from('encounters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false });
}

export async function createEncounter(campaignId: string, name?: string) {
  return supabase
    .from('encounters')
    .insert({ campaign_id: campaignId, ...(name ? { name } : {}) })
    .select()
    .single();
}

export async function updateEncounter(
  id: string,
  patch: { name?: string; description?: string | null; combatants?: EncounterCombatant[] },
) {
  return supabase
    .from('encounters')
    .update(patch as any)
    .eq('id', id);
}

export async function deleteEncounter(id: string) {
  return supabase
    .from('encounters')
    .delete()
    .eq('id', id);
}
