// Campaign window pane — DM pins imagery from a linked world to share
// with the table during a session. Reads + writes the
// `campaigns.scene_image_id` and `campaigns.subject_image_id` slots
// and resolves them into a render-ready payload (signed URL +
// caption).
//
// Two slots, both nullable. Pins are *references* to world_images
// rows — captions and image content stay in sync with edits to the
// underlying world page automatically. When the referenced image is
// soft-deleted, we surface null at read time so the caller can fall
// back to the world banner (scene) or hide the slot (subject).

import { supabase } from './client';
import { getWorldImageSignedUrlById } from './world-images';

/** Minimum payload the window pane needs to render one slot. */
export type WindowPaneSlot = {
  imageId: string;
  signedUrl: string;
  caption: string;
  alt: string;
  width: number;
  height: number;
};

/**
 * Default scene fallback — used when the campaign has no pinned
 * scene image. Resolved in this order:
 *   1. The campaign's own `cover_image_url` when the DM has set one.
 *      Same image that appears on the campaign list card.
 *   2. The first linked world's `cover_image_url` (the world banner)
 *      as a deeper fallback, preserving prior behavior for campaigns
 *      that haven't uploaded a cover yet.
 *
 * Captions don't apply since neither source is a world_images row.
 */
export type WindowPaneFallback = {
  signedUrl: string;
  /** Set when the fallback came from the campaign cover. */
  campaignName?: string;
  /** Set when the fallback came from the linked world's banner. */
  worldName?: string;
};

export type CampaignWindowPaneState = {
  scene: WindowPaneSlot | null;
  subject: WindowPaneSlot | null;
  /** Banner from the campaign's linked world. Renderer uses this
   *  when `scene` is null. Null when no world is linked or the
   *  linked world has no cover image. */
  fallback: WindowPaneFallback | null;
};

/**
 * Resolve the campaign's pinned scene + subject images into render-
 * ready payloads. Soft-deleted images surface as null so the caller
 * can fall back gracefully (world banner for scene, hidden subject).
 *
 * Both slots are independent — a missing scene doesn't block the
 * subject from rendering. The signed URL is short-lived (~1h); the
 * pane is expected to remount or refetch when it expires, which is
 * fine for session-length usage.
 */
export async function getCampaignWindowPane(campaignId: string): Promise<{
  data: CampaignWindowPaneState | null;
  error: { message: string } | null;
}> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('scene_image_id, subject_image_id, cover_image_url, name')
    .eq('id', campaignId)
    .single();
  if (error || !campaign) return { data: null, error };

  const [scene, subject, fallback] = await Promise.all([
    resolveSlot(campaign.scene_image_id),
    resolveSlot(campaign.subject_image_id),
    resolveFallbackBanner(campaignId, campaign.cover_image_url, campaign.name),
  ]);
  return { data: { scene, subject, fallback }, error: null };
}

/**
 * Resolve the scene fallback. Prefers the campaign's own cover when
 * set, otherwise drops to the first linked world's banner. Returns
 * null when neither is available.
 */
async function resolveFallbackBanner(
  campaignId: string,
  campaignCoverUrl: string | null,
  campaignName: string,
): Promise<WindowPaneFallback | null> {
  if (campaignCoverUrl) {
    return { signedUrl: campaignCoverUrl, campaignName };
  }
  const { data, error } = await supabase
    .from('world_campaigns')
    .select('world_id, worlds(name, cover_image_url)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  // The relationship type inference between world_campaigns and
  // worlds isn't reliable in the generated Database types (FK
  // metadata isn't always present in the dump), so we cast through
  // unknown and validate the shape defensively.
  const link = data[0] as unknown as {
    worlds: { name: string; cover_image_url: string | null } | null;
  };
  const url = link.worlds?.cover_image_url ?? null;
  if (!url) return null;
  return {
    signedUrl: url,
    worldName: link.worlds?.name ?? '',
  };
}

/**
 * Patch the campaign's scene slot. Pass null to clear (the renderer
 * will fall back to the world banner). RLS gates writes to the DM;
 * a non-DM call will fail at the row policy.
 */
export async function setCampaignSceneImage(
  campaignId: string,
  imageId: string | null,
) {
  return supabase
    .from('campaigns')
    .update({ scene_image_id: imageId })
    .eq('id', campaignId)
    .select('scene_image_id')
    .single();
}

/**
 * Patch the campaign's subject slot. Pass null to clear; the
 * subject hides when null. RLS gates writes to the DM.
 */
export async function setCampaignSubjectImage(
  campaignId: string,
  imageId: string | null,
) {
  return supabase
    .from('campaigns')
    .update({ subject_image_id: imageId })
    .eq('id', campaignId)
    .select('subject_image_id')
    .single();
}

/**
 * Internal: turn a world_images.id into a render-ready slot payload.
 * Returns null when the id is null OR the row is soft-deleted (the
 * pin survives but the renderer should treat it as cleared).
 */
async function resolveSlot(imageId: string | null): Promise<WindowPaneSlot | null> {
  if (!imageId) return null;
  const { data: row, error } = await supabase
    .from('world_images')
    .select('id, image_key, alt, caption, width, height, deleted_at')
    .eq('id', imageId)
    .single();
  if (error || !row) return null;
  if (row.deleted_at) return null;

  const { data: signed } = await getWorldImageSignedUrlById(row.id);
  if (!signed?.signedUrl) return null;

  return {
    imageId: row.id,
    signedUrl: signed.signedUrl,
    caption: row.caption ?? '',
    alt: row.alt ?? '',
    width: row.width,
    height: row.height,
  };
}
