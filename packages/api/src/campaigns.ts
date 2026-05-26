import { supabase } from './client';

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Returns all campaigns the authenticated user can access (DM + member).
// RLS handles the filtering — no userId needed.
export async function getCampaigns() {
  return supabase.from('campaigns').select('*').order('created_at', { ascending: false });
}

// Delegates to the create_campaign_with_gm RPC, which atomically inserts
// the campaign row and its GM membership row inside a single transaction
// and generates the join code server-side with built-in collision retry.
// See supabase/migrations/20260514000000_campaigns_system_and_packs.sql for
// the current signature — the `system` argument is required and validated
// against the game_systems table on the server.
export async function createCampaign(
  name: string,
  opts: { system: string; systemLabel?: string; description?: string },
) {
  const { data, error } = await supabase.rpc('create_campaign_with_gm', {
    p_name: name,
    p_system: opts.system,
    p_system_label: opts.systemLabel?.trim() || null,
    p_description: opts.description?.trim() || null,
  });
  return { data, error };
}

/**
 * Update the campaign's game system. The DM may want to switch systems
 * before any characters are created; once characters exist the UI should
 * lock this field (a system change would invalidate per-character system
 * tags). The DB itself doesn't enforce that lock — it's a UX guardrail
 * applied client-side.
 */
export async function updateCampaignSystem(campaignId: string, system: string) {
  return supabase
    .from('campaigns')
    .update({ system })
    .eq('id', campaignId);
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
    .select('campaign_id, user_id, role, character_id, joined_at, profiles(id, display_name), characters(id, name, system, avatar_url, avatar_card_url)')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true });
}

/**
 * Every character whose `campaign_id` points at this campaign — used
 * by both the Members card (one row per character grouped by user)
 * and the Party card (vitals rendering). Carries the full payload
 * needed for `PartyMemberCard` (HP/AC/conditions/portrait) so a
 * single fetch drives both surfaces; the older membership-pinned
 * path via `getCampaignMembers().characters` is now redundant for
 * party rendering and only kept for backwards compat.
 */
export async function getCharactersForCampaign(campaignId: string) {
  return supabase
    .from('characters')
    .select('id, user_id, name, base_stats, resources, conditions, avatar_url, avatar_card_url')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
}

// Batched count for the campaigns list — one round-trip for all campaigns
// instead of N calls to getCampaignMembers just to read `.length`.
export async function getMemberCountsForCampaigns(campaignIds: string[]) {
  if (campaignIds.length === 0) return { data: {} as Record<string, number>, error: null };
  const { data, error } = await supabase
    .from('campaign_members')
    .select('campaign_id')
    .in('campaign_id', campaignIds);
  if (error || !data) return { data: {} as Record<string, number>, error };
  const counts: Record<string, number> = {};
  for (const row of data) counts[row.campaign_id] = (counts[row.campaign_id] ?? 0) + 1;
  return { data: counts, error: null };
}

// Party view needs the full character payload (resources + conditions) so it
// can render HP, AC, and condition chips without a second round-trip per row.
export async function getCampaignPartyState(campaignId: string) {
  return supabase
    .from('campaign_members')
    .select('user_id, role, character_id, joined_at, profiles(id, display_name), characters(id, name, base_stats, resources, conditions)')
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

export async function updatePartyViewSettings(
  campaignId: string,
  settings: {
    showHpNumbersToPlayers: boolean;
    showConditionsToPlayers: boolean;
    showSlotsToPlayers: boolean;
    showResourcesToPlayers: boolean;
    allowPlayerCrossView: boolean;
  },
) {
  return supabase
    .from('campaigns')
    .update({ party_view_settings: settings as never })
    .eq('id', campaignId);
}

export async function updateCampaign(
  campaignId: string,
  patch: Partial<{
    next_session_at: string | null;
    next_session_prep_page_id: string | null;
    cover_image_url: string | null;
  }>,
) {
  return supabase.from('campaigns').update(patch).eq('id', campaignId);
}

const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Upload a campaign cover image. Reused across the All Campaigns
 * card cover and the window-pane fallback when no scene is pinned.
 * Stored in the shared `campaign-assets` bucket under
 * `campaign-covers/{campaignId}.{ext}` so it can be overwritten on
 * re-upload without leaving orphan files. The public URL is
 * cache-busted with a `?v=timestamp` so a re-upload appears
 * immediately in the UI.
 */
export async function uploadCampaignCover(
  campaignId: string,
  fileUri: string,
  mimeType: string,
) {
  if (!ALLOWED_COVER_TYPES.includes(mimeType)) {
    return { url: null, error: { message: 'Only JPEG, PNG, and WebP images are allowed.' } };
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `campaign-covers/${campaignId}.${ext}`;

  const response = await fetch(fileUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(path, blob, { contentType: mimeType, upsert: true });

  if (uploadError) return { url: null, error: uploadError };

  const { data: { publicUrl } } = supabase.storage
    .from('campaign-assets')
    .getPublicUrl(path);

  const versionedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ cover_image_url: versionedUrl })
    .eq('id', campaignId);

  if (updateError) return { url: null, error: updateError };

  return { url: versionedUrl, error: null };
}

export async function deleteCampaign(campaignId: string) {
  return supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId);
}

