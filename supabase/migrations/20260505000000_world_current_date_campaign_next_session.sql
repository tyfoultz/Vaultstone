-- Current in-world date for the hero banner era chip + date display.
-- date_values.era doubles as the current era key — no separate column needed.
alter table public.worlds
  add column if not exists current_date_values jsonb;

-- DM-set date for the next scheduled session.
alter table public.campaigns
  add column if not exists next_session_at timestamptz;
