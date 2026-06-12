-- Campaign scene/subject images must be readable by every campaign
-- member, not just those who can view the underlying world page.
--
-- Problem: `world_images_member_select` (Phase 7b) gates SELECT on
-- `user_can_view_page(page_id)` — the viewer must be able to see the
-- world page the image lives on. But when a DM right-click → "Pin to
-- Scene / Pin as Subject", they are explicitly choosing to share that
-- image with the whole table for the session. Players who aren't world
-- members (or where the source page is GM-only) failed that gate, so
-- `getCampaignWindowPane` resolved the slot to null for them and they
-- only ever saw the world-banner fallback — the scene never "switched"
-- on their screens even though Realtime delivered the campaigns UPDATE.
--
-- Fix: an additive policy granting SELECT on any world_images row that
-- is currently pinned as the scene or subject of a campaign the viewer
-- is a member of. RLS policies are OR'd, so this only widens access for
-- the explicitly-shared image; the page-visibility path is untouched.
--
-- No recursion: the subquery reads `campaigns` (whose SELECT policy is
-- the security-definer `is_campaign_member(id)`) and calls
-- `is_campaign_member`, both of which bypass world_images RLS.

drop policy if exists world_images_campaign_pin_select on public.world_images;
create policy world_images_campaign_pin_select on public.world_images
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where (c.scene_image_id = world_images.id
             or c.subject_image_id = world_images.id)
        and public.is_campaign_member(c.id)
    )
  );
