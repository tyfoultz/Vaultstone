-- Sub-maps can legitimately reuse parent imagery (e.g. a zoomed crop shared
-- by both the region map and a city sub-map). The uniqueness guarantee only
-- existed to prevent duplicate uploads, which is better handled at the
-- client level. Drop the constraint so multiple world_maps rows may point
-- at the same storage object.
alter table public.world_maps drop constraint if exists world_maps_image_key_key;
