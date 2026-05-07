-- Campaign window pane — DM-pinned imagery shared with the table.
--
-- Two slots, both nullable:
--   scene_image_id    — the wide environment shot (16:9). Default
--                       fallback when null is the campaign's world
--                       banner; both also fall back when the
--                       referenced image is deleted.
--   subject_image_id  — a portrait/foreground (9:16) overlaid in the
--                       top-right of the scene. Hidden when null.
--
-- Pin = reference, not snapshot. Edits to the pinned image (caption,
-- replacement file via re-upload at the same id, soft-delete) flow
-- through to whoever is currently viewing the pane. ON DELETE SET
-- NULL on both columns so a hard-deleted image clears the slot
-- rather than dangling. Soft-deletes (deleted_at IS NOT NULL) are
-- handled at read time — the API layer falls back to the world
-- banner when the row is soft-deleted.

alter table public.campaigns
  add column if not exists scene_image_id   uuid references public.world_images(id) on delete set null,
  add column if not exists subject_image_id uuid references public.world_images(id) on delete set null;

-- Per-campaign read indexes — the pane reads scene + subject on
-- every campaign-page mount, so a covering index speeds the join
-- without lock contention on writes (pin actions are infrequent).
create index if not exists campaigns_scene_image_idx
  on public.campaigns (scene_image_id) where scene_image_id is not null;
create index if not exists campaigns_subject_image_idx
  on public.campaigns (subject_image_id) where subject_image_id is not null;
