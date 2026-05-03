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
 * For a list of pack ids, return which enabled campaigns each pack is
 * attached to. Used by the Game Systems page to show a "Used by N
 * campaigns" indicator per pack card.
 *
 * RLS scopes the campaign_packs SELECT to "DM or member" so users see
 * only their own usages — a player can't surface a list of every campaign
 * the pack is in across the whole system.
 *
 * Returns a map of packId → array of { campaignId, campaignName }.
 */
export async function getPackCampaignUsage(
  packIds: string[],
): Promise<Map<string, Array<{ campaignId: string; campaignName: string }>>> {
  const result = new Map<string, Array<{ campaignId: string; campaignName: string }>>();
  if (packIds.length === 0) return result;

  const { data } = await supabase
    .from('campaign_packs')
    .select('pack_id, campaigns!inner(id, name)')
    .in('pack_id', packIds)
    .eq('enabled', true);

  for (const row of data ?? []) {
    // Supabase's foreign-table join via `!inner` returns the joined
    // record on the row. The runtime shape matches `{ id, name }`; the
    // PostgREST types model it as a possibly-array, so we narrow.
    const c = (row as unknown as { pack_id: string; campaigns: { id: string; name: string } }).campaigns;
    if (!c) continue;
    const slot = result.get(row.pack_id) ?? [];
    slot.push({ campaignId: c.id, campaignName: c.name });
    result.set(row.pack_id, slot);
  }
  return result;
}

/**
 * Eligible packs the DM can add to a campaign — every pack the DM owns
 * for the campaign's system, minus the ones already attached. The
 * personal-vs-campaign-scoped filter is gone with the unified sharing
 * model; all packs live in the owner's library and become available to
 * a campaign only when explicitly added.
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
      .eq('system', input.system),
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
