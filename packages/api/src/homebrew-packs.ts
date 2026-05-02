import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type HomebrewPackRow = Database['public']['Tables']['homebrew_packs']['Row'];
type HomebrewPackInsert = Database['public']['Tables']['homebrew_packs']['Insert'];
type HomebrewPackUpdate = Database['public']['Tables']['homebrew_packs']['Update'];

/**
 * List packs the authenticated user can access. RLS determines which rows
 * are returned — owner's own packs always, plus published campaign-scoped
 * packs in any campaign they belong to.
 *
 * Filters:
 *   `system`     — narrow to one game system (e.g. 'dnd5e_2024'). Packs
 *                  are system-tagged at creation; cross-system mixing
 *                  isn't supported because mechanical content can't run
 *                  on the wrong ruleset.
 *   `campaignId` — narrow to a specific campaign's packs. Omit for the
 *                  user's full library across campaigns + personal.
 */
export async function listHomebrewPacks(opts?: { system?: string; campaignId?: string }) {
  let query = supabase
    .from('homebrew_packs')
    .select('*')
    .order('updated_at', { ascending: false });

  if (opts?.system) {
    query = query.eq('system', opts.system);
  }
  if (opts?.campaignId) {
    query = query.eq('campaign_id', opts.campaignId);
  }
  return query;
}

export async function getHomebrewPack(packId: string) {
  return supabase
    .from('homebrew_packs')
    .select('*')
    .eq('id', packId)
    .single();
}

/**
 * Create a new pack owned by the authenticated user. The caller must pass
 * `ownerUserId` (typically `useAuthStore.getState().user!.id`) so the
 * insert satisfies the RLS check `auth.uid() = owner_user_id`. `system`
 * identifies which game system the pack is compatible with — entries
 * inside use that system's mechanical schema.
 */
export async function createHomebrewPack(input: {
  ownerUserId: string;
  system: string;
  name: string;
  description?: string | null;
  campaignId?: string | null;
}) {
  const row: HomebrewPackInsert = {
    owner_user_id: input.ownerUserId,
    system: input.system,
    name: input.name,
    description: input.description ?? null,
    campaign_id: input.campaignId ?? null,
  };
  return supabase
    .from('homebrew_packs')
    .insert(row)
    .select()
    .single();
}

export async function updateHomebrewPack(packId: string, patch: HomebrewPackUpdate) {
  return supabase
    .from('homebrew_packs')
    .update(patch)
    .eq('id', packId)
    .select()
    .single();
}

export async function deleteHomebrewPack(packId: string) {
  return supabase
    .from('homebrew_packs')
    .delete()
    .eq('id', packId);
}

/** Count of homebrew_content rows belonging to a pack. */
export async function getHomebrewPackEntryCount(packId: string) {
  const { count, error } = await supabase
    .from('homebrew_content')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);
  return { count: count ?? 0, error };
}

export type { HomebrewPackRow };
