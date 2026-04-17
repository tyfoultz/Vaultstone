import { supabase } from './client';

// Returns worlds the authenticated user can access (owned ∪ linked-campaign-member).
// RLS handles the union — no userId needed.
export async function getWorlds() {
  return supabase
    .from('worlds')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
}

export async function getWorld(worldId: string) {
  return supabase
    .from('worlds')
    .select('*')
    .eq('id', worldId)
    .is('deleted_at', null)
    .single();
}

// Delegates to the create_world_with_owner RPC, which atomically inserts
// the world row and any initial world↔campaign links inside a single
// transaction. See supabase/migrations/20260420000000_world_builder_phase_1.sql.
export async function createWorld(
  name: string,
  opts?: { description?: string; campaignIds?: string[] },
) {
  const { data, error } = await supabase.rpc('create_world_with_owner', {
    p_name: name,
    p_description: opts?.description?.trim() || null,
    p_campaign_ids: opts?.campaignIds && opts.campaignIds.length > 0 ? opts.campaignIds : null,
  });
  return { data, error };
}

export async function updateWorld(
  worldId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    cover_image_url: string | null;
    is_archived: boolean;
  }>,
) {
  return supabase.from('worlds').update(patch).eq('id', worldId);
}

export async function archiveWorld(worldId: string) {
  return updateWorld(worldId, { is_archived: true });
}

export async function unarchiveWorld(worldId: string) {
  return updateWorld(worldId, { is_archived: false });
}

export async function softDeleteWorld(worldId: string) {
  return supabase
    .from('worlds')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', worldId);
}
