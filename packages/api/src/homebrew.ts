import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type HomebrewInsert = Database['public']['Tables']['homebrew_content']['Insert'];

export async function getHomebrew(userId: string, campaignId?: string) {
  const query = supabase
    .from('homebrew_content')
    .select('*')
    .eq('user_id', userId);

  if (campaignId) {
    return query.eq('campaign_id', campaignId);
  }
  return query.is('campaign_id', null);
}

export async function createHomebrew(content: HomebrewInsert) {
  return supabase
    .from('homebrew_content')
    .insert(content)
    .select()
    .single();
}
