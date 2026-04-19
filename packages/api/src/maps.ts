import { supabase } from './client';
import type { Database } from '@vaultstone/types';

export type WorldMap = Database['public']['Tables']['world_maps']['Row'];
export type WorldMapInsert = Database['public']['Tables']['world_maps']['Insert'];

export async function listMaps(worldId: string) {
  return supabase
    .from('world_maps')
    .select('*')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
}

export async function getMap(mapId: string) {
  return supabase
    .from('world_maps')
    .select('*')
    .eq('id', mapId)
    .is('deleted_at', null)
    .single();
}

export async function getMapsOwnedByPages(pageIds: string[]) {
  if (pageIds.length === 0) return { data: [] as WorldMap[], error: null };
  return supabase
    .from('world_maps')
    .select('*')
    .in('owner_page_id', pageIds)
    .is('deleted_at', null);
}

export async function createMap(insert: WorldMapInsert) {
  return supabase.from('world_maps').insert(insert).select('*').single();
}

export async function updateMap(
  mapId: string,
  patch: Partial<Pick<WorldMap, 'label' | 'owner_page_id' | 'campaign_id'>>,
) {
  return supabase.from('world_maps').update(patch).eq('id', mapId).select('*').single();
}

export async function softDeleteMap(mapId: string) {
  const now = new Date();
  const hardDeleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return supabase
    .from('world_maps')
    .update({
      deleted_at: now.toISOString(),
      hard_delete_after: hardDeleteAfter.toISOString(),
    })
    .eq('id', mapId);
}

// Upload a file to the world-maps bucket at `{worldId}/{mapId}/{filename}`.
// Caller supplies a blob/File (web) or a URI-wrapped upload (native); both
// resolve to ArrayBuffer-ish bodies that Supabase Storage accepts.
export async function uploadMapImage(params: {
  worldId: string;
  mapId: string;
  filename: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}) {
  const key = `${params.worldId}/${params.mapId}/${params.filename}`;
  const { data, error } = await supabase.storage.from('world-maps').upload(key, params.body, {
    contentType: params.contentType,
    upsert: false,
  });
  return { data, error, key };
}

// Signed URL for a stored map image. 1-hour TTL is generous for pan/zoom
// sessions; refetched on mount so stale sessions retry cleanly.
export async function getMapImageSignedUrl(imageKey: string, expiresInSeconds = 60 * 60) {
  return supabase.storage.from('world-maps').createSignedUrl(imageKey, expiresInSeconds);
}
