-- DM-entered initiative totals (physical tabletop flow). init_override
-- takes precedence over init_value + init_roll when set, and clears the
-- d20 breakdown from the UI so the subtitle isn't fabricated.

alter table public.initiative_order
  add column if not exists init_override int null;
