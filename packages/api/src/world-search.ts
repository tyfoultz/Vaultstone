import { supabase } from './client';

export type SearchResult = {
  result_type: 'page' | 'pin' | 'event';
  id: string;
  world_id: string;
  title: string;
  preview: string;
  section_name: string;
  page_kind: string;
  is_orphaned: boolean;
  visible_to_players: boolean;
  updated_at: string;
};

export type CampaignSearchResult = SearchResult & {
  world_name: string;
};

export async function searchWorld(
  worldId: string,
  query: string,
  limit = 10,
  offset = 0,
) {
  return supabase.rpc('search_world', {
    p_world_id: worldId,
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  }) as unknown as { data: SearchResult[] | null; error: { message: string } | null };
}

export async function searchCampaignWorlds(
  campaignId: string,
  query: string,
  limit = 10,
  offset = 0,
) {
  return supabase.rpc('search_campaign_worlds', {
    p_campaign_id: campaignId,
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  }) as unknown as { data: CampaignSearchResult[] | null; error: { message: string } | null };
}
