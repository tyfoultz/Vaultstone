const MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.82;

export async function compressImageBlob(
  file: Blob,
  opts?: { maxDimension?: number; quality?: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof window === 'undefined' || typeof createImageBitmap !== 'function') {
    return loadDimsOnly(file);
  }

  const maxDim = opts?.maxDimension ?? MAX_DIMENSION;
  const quality = opts?.quality ?? COMPRESS_QUALITY;

  const bitmap = await createImageBitmap(file);
  let { width: w, height: h } = bitmap;

  const needsResize = w > maxDim || h > maxDim;
  const isPng = file.type === 'image/png';
  const isLarge = file.size > 512 * 1024;

  if (!needsResize && !isPng && !isLarge) {
    bitmap.close();
    return { blob: file, width: w, height: h };
  }

  if (needsResize) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const compressed = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
      'image/jpeg',
      quality,
    );
  });

  return { blob: compressed, width: w, height: h };
}

async function loadDimsOnly(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  return { blob: file, width: 0, height: 0 };
}
