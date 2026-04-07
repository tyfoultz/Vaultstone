import { supabase } from './client';

export async function getCampaigns(userId: string) {
  return supabase
    .from('campaigns')
    .select('*')
    .or(`dm_user_id.eq.${userId}`);
}

export async function createCampaign(name: string, dmUserId: string, joinCode: string) {
  return supabase
    .from('campaigns')
    .insert({ name, dm_user_id: dmUserId, join_code: joinCode })
    .select()
    .single();
}

export async function getCampaignByJoinCode(joinCode: string) {
  return supabase
    .from('campaigns')
    .select('*')
    .eq('join_code', joinCode)
    .single();
}
