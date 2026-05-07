-- world_images.caption
--
-- Adds a display caption to world images, distinct from `alt`. Until
-- now the canvas image renderer was using `alt` (the accessibility
-- label) as both the screen-reader text AND the visible caption
-- below the image, which conflated two different concerns:
--   alt     — short description for assistive tech ("a hooded figure")
--   caption — display copy for readers ("Whisperwood, the cult
--             leader, in his ceremonial robes — Aug 9, 1492 DR")
--
-- Captions are also load-bearing for the campaign window pane: the
-- DM pins a world image to the scene/subject slot and players see the
-- caption alongside the image. Pin = reference to world_images.id, so
-- captions automatically flow through to the pane.

alter table public.world_images
  add column if not exists caption text not null default '';
