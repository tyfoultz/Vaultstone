-- Separate thumbnail for sidebar header, independent of the hero banner cover_image_url.
alter table public.worlds
  add column if not exists thumbnail_url text;
