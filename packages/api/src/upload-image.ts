import { supabase } from './client';
import { compressImageBlob } from './compress-image';

type UploadResult = { url: string; error: null } | { url: null; error: { message: string } };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadPublicImage(opts: {
  bucket: string;
  path: string;
  fileUri: string;
  mimeType: string;
  maxDimension?: number;
}): Promise<{ publicUrl: string; blob: Blob } | { publicUrl: null; error: { message: string } }> {
  if (!ALLOWED_TYPES.includes(opts.mimeType)) {
    return { publicUrl: null, error: { message: 'Only JPEG, PNG, and WebP images are allowed.' } };
  }

  const response = await fetch(opts.fileUri);
  const rawBlob = await response.blob();

  const { blob } = await compressImageBlob(rawBlob, {
    maxDimension: opts.maxDimension ?? 1920,
  });

  const contentType = blob.type || 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const finalPath = opts.path.replace(/\.[^.]+$/, `.${ext}`);

  const { error: uploadError } = await supabase.storage
    .from(opts.bucket)
    .upload(finalPath, blob, { contentType, upsert: true });

  if (uploadError) return { publicUrl: null, error: uploadError };

  const { data: { publicUrl } } = supabase.storage
    .from(opts.bucket)
    .getPublicUrl(finalPath);

  const cacheKey = `${Date.now()}`;
  return { publicUrl: `${publicUrl}?v=${cacheKey}`, blob };
}

export async function uploadAndSave(opts: {
  bucket: string;
  path: string;
  fileUri: string;
  mimeType: string;
  maxDimension?: number;
  table: 'campaigns' | 'characters' | 'worlds';
  rowId: string;
  column: string;
}): Promise<UploadResult> {
  const result = await uploadPublicImage({
    bucket: opts.bucket,
    path: opts.path,
    fileUri: opts.fileUri,
    mimeType: opts.mimeType,
    maxDimension: opts.maxDimension,
  });

  if ('error' in result) return { url: null, error: result.error };

  const { error: updateError } = await supabase
    .from(opts.table)
    .update({ [opts.column]: result.publicUrl } as never)
    .eq('id', opts.rowId);

  if (updateError) return { url: null, error: updateError };

  return { url: result.publicUrl, error: null };
}
