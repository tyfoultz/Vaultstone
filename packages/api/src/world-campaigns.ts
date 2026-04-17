import { supabase } from './client';

// Returns hydrated campaign rows linked to a world. RLS filters to what the
// caller can see (world owner sees all linked; campaign members see their own).
export async function getCampaignsForWorld(worldId: string) {
  return supabase
    .from('world_campaigns')
    .select('world_id, campaign_id, created_at, campaigns(*)')
    .eq('world_id', worldId)
    .order('created_at', { ascending: true });
}

export async function linkWorldToCampaign(worldId: string, campaignId: string) {
  return supabase
    .from('world_campaigns')
    .insert({ world_id: worldId, campaign_id: campaignId });
}

export async function unlinkWorldFromCampaign(worldId: string, campaignId: string) {
  return supabase
    .from('world_campaigns')
    .delete()
    .eq('world_id', worldId)
    .eq('campaign_id', campaignId);
}

// Used by downstream phases (lookup drawer, session integration) but cheap to add now.
export async function getWorldsForCampaign(campaignId: string) {
  return supabase
    .from('world_campaigns')
    .select('world_id, campaign_id, created_at, worlds(*)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
}
