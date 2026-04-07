import { supabase } from './client';

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Returns all campaigns the authenticated user can access (DM + member).
// RLS handles the filtering — no userId needed.
export async function getCampaigns() {
  return supabase.from('campaigns').select('*').order('created_at', { ascending: false });
}

export async function createCampaign(name: string, dmUserId: string, joinCode: string) {
  // Insert without RETURNING to avoid auth.uid() misbehaving in security-definer
  // SELECT policies during RETURNING evaluation. Fetch separately instead.
  const { error } = await supabase
    .from('campaigns')
    .insert({ name, dm_user_id: dmUserId, join_code: joinCode });

  if (error) return { data: null, error };

  return supabase
    .from('campaigns')
    .select('*')
    .eq('join_code', joinCode)
    .single();
}

// Uses a security-definer Postgres function so unauthenticated-to-campaign
// users can look up a campaign by its join code (the code is the capability token).
export async function getCampaignByJoinCode(joinCode: string) {
  const { data, error } = await supabase
    .rpc('get_campaign_by_join_code', { p_join_code: joinCode });
  return { data: data?.[0] ?? null, error };
}

export async function joinCampaign(campaignId: string, userId: string) {
  return supabase
    .from('campaign_members')
    .insert({ campaign_id: campaignId, user_id: userId })
    .select()
    .single();
}
