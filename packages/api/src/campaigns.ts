import { supabase } from './client';

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Returns all campaigns the authenticated user can access (DM + member).
// RLS handles the filtering — no userId needed.
export async function getCampaigns() {
  return supabase.from('campaigns').select('*').order('created_at', { ascending: false });
}

export async function createCampaign(
  name: string,
  dmUserId: string,
  joinCode: string,
  opts?: { systemLabel?: string; description?: string },
) {
  // Insert without RETURNING to avoid auth.uid() misbehaving in security-definer
  // SELECT policies during RETURNING evaluation. Fetch separately instead.
  const { error } = await supabase
    .from('campaigns')
    .insert({
      name,
      dm_user_id: dmUserId,
      join_code: joinCode,
      system_label: opts?.systemLabel?.trim() || null,
      description: opts?.description?.trim() || null,
    });

  if (error) return { data: null, error };

  // Fetch the new campaign so we have its id.
  const { data: campaign, error: fetchError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('join_code', joinCode)
    .single();

  if (fetchError || !campaign) return { data: null, error: fetchError };

  // Record the DM as an explicit campaign_members row with role 'gm'.
  // This unifies all membership under one table for member management.
  const { error: memberError } = await supabase
    .from('campaign_members')
    .insert({ campaign_id: campaign.id, user_id: dmUserId, role: 'gm' });

  if (memberError) return { data: null, error: memberError };

  return { data: campaign, error: null };
}

// Uses a security-definer Postgres function so unauthenticated-to-campaign
// users can look up a campaign by its join code (the code is the capability token).
export async function getCampaignByJoinCode(joinCode: string) {
  const { data, error } = await supabase
    .rpc('get_campaign_by_join_code', { p_join_code: joinCode });
  return { data: data?.[0] ?? null, error };
}

export async function regenerateJoinCode(campaignId: string) {
  const newCode = generateJoinCode();
  const { error } = await supabase
    .from('campaigns')
    .update({ join_code: newCode })
    .eq('id', campaignId);
  return { code: error ? null : newCode, error };
}

export async function getCampaignMembers(campaignId: string) {
  return supabase
    .from('campaign_members')
    .select('campaign_id, user_id, role, character_id, joined_at, profiles(id, display_name)')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true });
}

export async function removeCampaignMember(campaignId: string, userId: string) {
  return supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
}

export async function joinCampaign(campaignId: string, userId: string) {
  return supabase
    .from('campaign_members')
    .insert({ campaign_id: campaignId, user_id: userId, role: 'player' })
    .select()
    .single();
}
