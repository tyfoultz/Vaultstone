import { supabase } from './client';
import type { Database } from '@vaultstone/types';

export type WorldImage = Database['public']['Tables']['world_images']['Row'];
type WorldImageInsert = Database['public']['Tables']['world_images']['Insert'];

const STORAGE_CAP_BYTES = 500 * 1024 * 1024; // 500 MB
const WARN_THRESHOLD = 0.8;

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

export async function getWorldImageSignedUrl(imageKey: string, expiresInSeconds = 60 * 60) {
  return supabase.storage.from('world-images').createSignedUrl(imageKey, expiresInSeconds);
}

export async function getWorldImageSignedUrlById(imageId: string, expiresInSeconds = 60 * 60) {
  const { data: row, error: rowErr } = await supabase
    .from('world_images')
    .select('image_key')
    .eq('id', imageId)
    .is('deleted_at', null)
    .single();
  if (rowErr || !row) return { data: null, error: rowErr };
  return supabase.storage.from('world-images').createSignedUrl(row.image_key, expiresInSeconds);
}

export async function listImagesForPage(pageId: string) {
  return supabase
    .from('world_images')
    .select('*')
    .eq('page_id', pageId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
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
