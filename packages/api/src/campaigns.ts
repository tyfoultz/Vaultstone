import { supabase } from './client';

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function getCampaigns(userId: string) {
  return supabase
    .from('campaigns')
    .select('*')
    .eq('dm_user_id', userId);
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
