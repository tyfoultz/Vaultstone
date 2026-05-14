-- Separate card-view crop of the character portrait (2:1 aspect).
alter table public.characters
  add column if not exists avatar_card_url text;
