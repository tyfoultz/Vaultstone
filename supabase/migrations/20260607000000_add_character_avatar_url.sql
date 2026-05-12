-- Add avatar_url column to characters for portrait uploads.
alter table public.characters
  add column if not exists avatar_url text;
