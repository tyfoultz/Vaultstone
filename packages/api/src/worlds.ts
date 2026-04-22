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
    thumbnail_url: string | null;
    current_date_values: Record<string, string> | null;
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

const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadWorldCover(worldId: string, fileUri: string, mimeType: string) {
  if (!ALLOWED_COVER_TYPES.includes(mimeType)) {
    return { url: null, error: { message: 'Only JPEG, PNG, and WebP images are allowed.' } };
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `world-covers/${worldId}.${ext}`;

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
    .from('worlds')
    .update({ cover_image_url: versionedUrl })
    .eq('id', worldId);

  if (updateError) return { url: null, error: updateError };

  return { url: versionedUrl, error: null };
}

export async function uploadWorldThumbnail(worldId: string, fileUri: string, mimeType: string) {
  if (!ALLOWED_COVER_TYPES.includes(mimeType)) {
    return { url: null, error: { message: 'Only JPEG, PNG, and WebP images are allowed.' } };
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `world-thumbnails/${worldId}.${ext}`;

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
    .from('worlds')
    .update({ thumbnail_url: versionedUrl })
    .eq('id', worldId);

  if (updateError) return { url: null, error: updateError };

  return { url: versionedUrl, error: null };
}

export async function softDeleteWorld(worldId: string) {
  return supabase
    .from('worlds')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', worldId);
}
