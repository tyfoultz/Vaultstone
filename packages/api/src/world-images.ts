import { supabase } from './client';
import { getCachedSignedUrl, setCachedSignedUrl } from './signed-url-cache';
import type { Database } from '@vaultstone/types';

export type WorldImage = Database['public']['Tables']['world_images']['Row'];
type WorldImageInsert = Database['public']['Tables']['world_images']['Insert'];

const STORAGE_CAP_BYTES = 500 * 1024 * 1024; // 500 MB
const WARN_THRESHOLD = 0.8;
const SIGNED_URL_TTL = 24 * 60 * 60; // 24 hours

export async function uploadWorldImage(params: {
  worldId: string;
  imageId: string;
  filename: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}) {
  const key = `${params.worldId}/${params.imageId}/${params.filename}`;
  const { data, error } = await supabase.storage.from('world-images').upload(key, params.body, {
    contentType: params.contentType,
    upsert: false,
  });
  return { data, error, key };
}

export async function createWorldImage(insert: WorldImageInsert) {
  return supabase.from('world_images').insert(insert).select('*').single();
}

export async function getWorldImageSignedUrl(imageKey: string, expiresInSeconds = SIGNED_URL_TTL) {
  const cached = getCachedSignedUrl(`wi:${imageKey}`);
  if (cached) return { data: { signedUrl: cached }, error: null };

  const result = await supabase.storage.from('world-images').createSignedUrl(imageKey, expiresInSeconds);
  if (result.data?.signedUrl) {
    setCachedSignedUrl(`wi:${imageKey}`, result.data.signedUrl, expiresInSeconds);
  }
  return result;
}

export async function getWorldImageSignedUrlById(imageId: string, expiresInSeconds = SIGNED_URL_TTL) {
  const cached = getCachedSignedUrl(`wi-id:${imageId}`);
  if (cached) return { data: { signedUrl: cached }, error: null };

  const { data: row, error: rowErr } = await supabase
    .from('world_images')
    .select('image_key')
    .eq('id', imageId)
    .is('deleted_at', null)
    .single();
  if (rowErr || !row) return { data: null, error: rowErr };
  const result = await supabase.storage.from('world-images').createSignedUrl(row.image_key, expiresInSeconds);
  if (result.data?.signedUrl) {
    setCachedSignedUrl(`wi-id:${imageId}`, result.data.signedUrl, expiresInSeconds);
  }
  return result;
}

const IMAGE_LIST_COLUMNS = 'id, world_id, page_id, image_key, caption, created_at';

export async function listImagesForPage(pageId: string) {
  return supabase
    .from('world_images')
    .select(IMAGE_LIST_COLUMNS)
    .eq('page_id', pageId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
}

/**
 * Patch a world image's display caption. Used by the right-click →
 * "Edit caption" flow on the canvas; the canvas Tiptap node attrs
 * are also patched in the same handler so the canvas reflects the
 * change without a refetch. The caption flows through to the
 * campaign window pane automatically (the pane reads the live row).
 */
export async function updateWorldImageCaption(imageId: string, caption: string) {
  return supabase
    .from('world_images')
    .update({ caption })
    .eq('id', imageId)
    .select('id, caption')
    .single();
}

export async function softDeleteWorldImage(imageId: string) {
  const now = new Date();
  const hardDeleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return supabase
    .from('world_images')
    .update({
      deleted_at: now.toISOString(),
      hard_delete_after: hardDeleteAfter.toISOString(),
    })
    .eq('id', imageId);
}

export async function getMyStorageUsage(): Promise<{
  usedBytes: number;
  capBytes: number;
  pct: number;
  warn: boolean;
  blocked: boolean;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { usedBytes: 0, capBytes: STORAGE_CAP_BYTES, pct: 0, warn: false, blocked: false };
  const { data } = await supabase
    .from('profiles')
    .select('storage_used_bytes')
    .eq('id', user.id)
    .single();
  const usedBytes = data?.storage_used_bytes ?? 0;
  const pct = usedBytes / STORAGE_CAP_BYTES;
  return {
    usedBytes,
    capBytes: STORAGE_CAP_BYTES,
    pct,
    warn: pct >= WARN_THRESHOLD,
    blocked: pct >= 1,
  };
}
