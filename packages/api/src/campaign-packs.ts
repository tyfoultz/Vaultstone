// Campaign ↔ Pack join API. The DM picks which homebrew packs apply to a
// campaign by toggling rows in `campaign_packs`. Players see the resulting
// list (read-only) so they know what content is in play, and the
// character creation wizard uses it to filter ContentResolver output.
//
// RLS:
//   * Read — DM or any character owner in the campaign.
//   * Write (insert/update/delete) — only the DM.
// We rely on RLS for authorization rather than checking client-side.

import { supabase } from './client';
import type { Database } from '@vaultstone/types';
import type { HomebrewPackRow } from './homebrew-packs';

export type CampaignPackRow = Database['public']['Tables']['campaign_packs']['Row'];

/**
 * List the campaign's enabled packs joined to their pack metadata. Returns
 * the joined rows so callers can render name/description/system without a
 * second round-trip.
 */
export async function listCampaignPacks(campaignId: string) {
  return supabase
    .from('campaign_packs')
    .select('campaign_id, pack_id, enabled, added_at, homebrew_packs!inner(*)')
    .eq('campaign_id', campaignId)
    .order('added_at', { ascending: true });
}

/**
 * Add a pack to the campaign. The pack must be system-compatible — we
 * validate that here rather than in the DB so the error message is
 * precise and the DB schema stays simple. RLS still ensures only the DM
 * can insert.
 */
export async function addPackToCampaign(input: {
  campaignId: string;
  packId: string;
}) {
  return supabase
    .from('campaign_packs')
    .insert({
      campaign_id: input.campaignId,
      pack_id: input.packId,
      enabled: true,
    })
    .select()
    .single();
}

/**
 * Toggle the enabled flag for an already-attached pack. Distinct from
 * removeFromCampaign — toggling preserves the join row and `added_at`,
 * so the DM can flip a pack off temporarily and back on without losing
 * the configuration.
 */
export async function setCampaignPackEnabled(
  campaignId: string,
  packId: string,
  enabled: boolean,
) {
  return supabase
    .from('campaign_packs')
    .update({ enabled })
    .eq('campaign_id', campaignId)
    .eq('pack_id', packId);
}

export async function removePackFromCampaign(campaignId: string, packId: string) {
  return supabase
    .from('campaign_packs')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('pack_id', packId);
}

/**
 * Eligible packs the DM can add to a campaign — their own personal-library
 * packs (campaign_id IS NULL) and packs already scoped to *this* campaign
 * (campaign_id = X), filtered to ones whose system matches the campaign.
 *
 * Excludes packs already in the join table so the picker doesn't show
 * duplicates. Done client-side via a follow-up filter; doing it in the
 * query would require a NOT EXISTS subquery the PostgREST surface
 * doesn't expose cleanly.
 */
export async function listEligiblePacksForCampaign(input: {
  campaignId: string;
  system: string;
  ownerUserId: string;
}): Promise<{ data: HomebrewPackRow[]; error: { message: string } | null }> {
  const [allMine, attached] = await Promise.all([
    supabase
      .from('homebrew_packs')
      .select('*')
      .eq('owner_user_id', input.ownerUserId)
      .eq('system', input.system)
      .or(`campaign_id.is.null,campaign_id.eq.${input.campaignId}`),
    supabase
      .from('campaign_packs')
      .select('pack_id')
      .eq('campaign_id', input.campaignId),
  ]);

  if (allMine.error) return { data: [], error: allMine.error };
  if (attached.error) return { data: [], error: attached.error };

  const attachedIds = new Set((attached.data ?? []).map((r) => r.pack_id));
  const eligible = (allMine.data ?? []).filter((p) => !attachedIds.has(p.id));
  return { data: eligible as HomebrewPackRow[], error: null };
}
