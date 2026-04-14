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
    .select('campaign_id, user_id, role, character_id, joined_at, profiles(id, display_name), characters(id, name, base_stats)')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true });
}

export async function updateCampaignMember(
  campaignId: string,
  userId: string,
  updates: { character_id?: string | null; role?: 'gm' | 'player' | 'co_gm' },
) {
  return supabase
    .from('campaign_members')
    .update(updates)
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
}

export async function removeCampaignMember(campaignId: string, userId: string) {
  return supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
}

export async function joinCampaign(campaignId: string, userId: string) {
  // Split insert and fetch — INSERT...RETURNING evaluates the SELECT policy
  // which can fail in RLS contexts (see CLAUDE.md RLS Gotchas).
  const { error } = await supabase
    .from('campaign_members')
    .insert({ campaign_id: campaignId, user_id: userId, role: 'player' });

  if (error) return { data: null, error };

  const { data, error: fetchError } = await supabase
    .from('campaign_members')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .single();

  return { data, error: fetchError };
}

export async function assignCharacterToCampaign(
  campaignId: string,
  userId: string,
  characterId: string | null,
) {
  return supabase
    .from('campaign_members')
    .update({ character_id: characterId })
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
}

const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadCampaignCover(campaignId: string, fileUri: string, mimeType: string) {
  if (!ALLOWED_COVER_TYPES.includes(mimeType)) {
    return { url: null, error: { message: 'Only JPEG, PNG, and WebP images are allowed.' } };
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `campaign-covers/${campaignId}.${ext}`;

  // Fetch the file as a blob for upload
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(path, blob, { contentType: mimeType, upsert: true });

  if (uploadError) return { url: null, error: uploadError };

  const { data: { publicUrl } } = supabase.storage
    .from('campaign-assets')
    .getPublicUrl(path);

  // Save the URL to the campaign row
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ cover_image_url: publicUrl })
    .eq('id', campaignId);

  if (updateError) return { url: null, error: updateError };

  return { url: publicUrl, error: null };
}
