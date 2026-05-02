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
 * Pass `campaignId` to scope the query to a specific campaign's packs;
 * omit it for the user's full library.
 */
export async function listHomebrewPacks(opts?: { campaignId?: string }) {
  let query = supabase
    .from('homebrew_packs')
    .select('*')
    .order('updated_at', { ascending: false });

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
 * insert satisfies the RLS check `auth.uid() = owner_user_id`.
 */
export async function createHomebrewPack(input: {
  ownerUserId: string;
  name: string;
  description?: string | null;
  campaignId?: string | null;
}) {
  const row: HomebrewPackInsert = {
    owner_user_id: input.ownerUserId,
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
