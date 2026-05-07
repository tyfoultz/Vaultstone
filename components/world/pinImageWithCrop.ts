// Crop-aware pinning for the campaign window pane.
//
// The pane has two slots — Scene (16:9) and Subject (9:16). Source
// images uploaded to a world page can be any aspect, so when the
// user pins one, we check whether its native aspect matches the
// target slot. If not, we surface the ImageCropModal at the right
// aspect, upload the cropped result as a NEW world_images record,
// and pin that record's id. The original image keeps its place in
// the canvas at its native dimensions.
//
// Why a new world_images record instead of an in-place crop?
//   • The original lives in the canvas as the user laid it out.
//     Mutating it would change the canvas rendering.
//   • Each slot has a different aspect; pinning the same source
//     to both Scene and Subject would otherwise need crop region
//     metadata on the campaign row. The "new record per pin"
//     approach keeps the schema simple — a pin is just an id ref.
//   • The DB cost is one extra row per crop pin; soft-deletes can
//     reclaim space if it ever matters. Today's storage cap is
//     500MB and image size is bounded, so this is negligible.

import {
  createWorldImage,
  getWorldImageSignedUrlById,
  setCampaignSceneImage,
  setCampaignSubjectImage,
  uploadWorldImage,
} from '@vaultstone/api';

export type PinSlot = 'scene' | 'subject';

/** Aspect tuple [w, h] for a slot. Used by the crop modal and the
 *  match check before deciding whether cropping is needed. */
export const SLOT_ASPECT: Record<PinSlot, [number, number]> = {
  scene:   [16, 9],
  subject: [9, 16],
};

/**
 * Decision payload for the pin flow. Always returns `crop` —
 * even when the source's aspect matches the slot, we want the
 * user to confirm the framing (which part of the image faces
 * the camera, where the focal point sits, etc.). The `signedUrl`
 * is the source image for the crop modal.
 */
export type PinDecision =
  | { mode: 'crop'; aspect: [number, number]; signedUrl: string };

export async function decidePinFlow(args: {
  imageId: string;
  slot: PinSlot;
}): Promise<PinDecision | null> {
  const { imageId, slot } = args;
  const { data } = await getWorldImageSignedUrlById(imageId);
  if (!data?.signedUrl) return null;
  return {
    mode: 'crop',
    aspect: SLOT_ASPECT[slot],
    signedUrl: data.signedUrl,
  };
}

/**
 * Commit a cropped pin to the campaign. Uploads the cropped blob
 * as a new world_images record (parented under the same world; no
 * page_id since it's a derived asset, not a page-embedded image)
 * and pins that new record's id.
 *
 * `croppedBlobUri` is required — the caller hands back the URI
 * from ImageCropModal's onConfirm.
 */
export async function commitPin(args: {
  campaignId: string;
  worldId: string;
  slot: PinSlot;
  /** Source world_images.id — used to inherit caption + as the
   *  starting point for the crop. */
  sourceImageId: string;
  /** Width/height of the source image. Only used to pick stored
   *  dimensions on the new row at a sensible upper-bound; pane
   *  rendering uses object-fit cover so the metadata isn't
   *  load-bearing for visual layout. */
  sourceWidth: number;
  sourceHeight: number;
  /** Aspect tuple for the slot — drives the new row's stored
   *  dimensions. Always passed in (the cropper enforces it). */
  aspect: [number, number];
  /** Blob URI returned by ImageCropModal. */
  croppedBlobUri: string;
}): Promise<{ ok: true; pinnedImageId: string } | { ok: false; message: string }> {
  const { campaignId, worldId, slot, sourceWidth, sourceHeight,
          aspect, croppedBlobUri } = args;

  const newId = crypto.randomUUID();
  const blobResult = await fetch(croppedBlobUri);
  const blob = await blobResult.blob();
  // Pick stored dimensions that match the slot's aspect at a
  // reasonable resolution. We don't read the cropped blob's actual
  // pixel dimensions because they depend on the source image's
  // resolution; a fixed width-bounded box keeps the schema simple.
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
    // Derived crops aren't page-embedded — leave page_id null so
    // they don't show up in the source page's image list.
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
