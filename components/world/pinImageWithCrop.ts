// Crop-aware pinning for the campaign window pane.
//
// The pane has two slots — Scene and Subject. Source images uploaded
// to a world page can be any aspect, so when the user pins one we
// surface the ImageCropModal with aspect presets (16:9, 4:3, 1:1,
// 3:4, native) so the DM can choose an output shape. The cropped
// result is uploaded as a NEW world_images record and the campaign's
// slot column is set to that record's id. The original image keeps
// its place in the canvas at its native dimensions.

import type { AspectPreset } from '@vaultstone/ui';
import {
  createWorldImage,
  getWorldImageSignedUrlById,
  setCampaignSceneImage,
  setCampaignSubjectImage,
  uploadWorldImage,
} from '@vaultstone/api';

export type PinSlot = 'scene' | 'subject';

const COMMON_PRESETS: AspectPreset[] = [
  { label: '16:9', aspect: [16, 9] },
  { label: '4:3', aspect: [4, 3] },
  { label: '1:1', aspect: [1, 1] },
  { label: '3:4', aspect: [3, 4] },
];

export function buildPresets(
  sourceWidth: number,
  sourceHeight: number,
): AspectPreset[] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(sourceWidth, sourceHeight);
  const nw = sourceWidth / g;
  const nh = sourceHeight / g;
  const nativeRatio = sourceWidth / sourceHeight;
  const isDuplicate = COMMON_PRESETS.some(
    (p) => Math.abs(p.aspect[0] / p.aspect[1] - nativeRatio) < 0.01,
  );
  if (isDuplicate) return COMMON_PRESETS;
  return [...COMMON_PRESETS, { label: `Native (${nw}:${nh})`, aspect: [sourceWidth, sourceHeight] }];
}

export type PinDecision = {
  mode: 'crop';
  aspect: [number, number];
  presets: AspectPreset[];
  signedUrl: string;
  sourceWidth: number;
  sourceHeight: number;
};

export async function decidePinFlow(args: {
  imageId: string;
  slot: PinSlot;
  sourceWidth: number;
  sourceHeight: number;
}): Promise<PinDecision | null> {
  const { imageId, sourceWidth, sourceHeight } = args;
  const { data } = await getWorldImageSignedUrlById(imageId);
  if (!data?.signedUrl) return null;
  const presets = buildPresets(sourceWidth, sourceHeight);
  return {
    mode: 'crop',
    aspect: presets[0]!.aspect,
    presets,
    signedUrl: data.signedUrl,
    sourceWidth,
    sourceHeight,
  };
}

/**
 * Commit a cropped pin to the campaign. Uploads the cropped blob
 * as a new world_images record (parented under the same world; no
 * page_id since it's a derived asset, not a page-embedded image)
 * and pins that new record's id.
 */
export async function commitPin(args: {
  campaignId: string;
  worldId: string;
  slot: PinSlot;
  sourceImageId: string;
  sourceWidth: number;
  sourceHeight: number;
  aspect: [number, number];
  croppedBlobUri: string;
}): Promise<{ ok: true; pinnedImageId: string } | { ok: false; message: string }> {
  const { campaignId, worldId, slot, sourceWidth, sourceHeight,
          aspect, croppedBlobUri } = args;

  const newId = crypto.randomUUID();
  const blobResult = await fetch(croppedBlobUri);
  const blob = await blobResult.blob();
  const [aw, ah] = aspect;
  const maxDim = Math.max(sourceWidth, sourceHeight) || 1600;
  const w = Math.min(1600, maxDim);
  const h = Math.round(w * (ah / aw));
  const filename = `pin-${slot}.jpg`;
  const { key, error: uploadErr } = await uploadWorldImage({
    worldId,
    imageId: newId,
    filename,
    body: blob,
    contentType: 'image/jpeg',
  });
  if (uploadErr) {
    return { ok: false, message: uploadErr.message };
  }
  const { error: rowErr } = await createWorldImage({
    id: newId,
    world_id: worldId,
    page_id: null,
    image_key: key,
    width: w,
    height: h,
    byte_size: blob.size,
    content_type: 'image/jpeg',
  });
  if (rowErr) {
    return { ok: false, message: rowErr.message };
  }

  const fn = slot === 'scene' ? setCampaignSceneImage : setCampaignSubjectImage;
  const { error } = await fn(campaignId, newId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, pinnedImageId: newId };
}
