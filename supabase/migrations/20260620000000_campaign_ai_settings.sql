-- Per-campaign AI assistant controls. Kept separate from party_view_settings
-- so AI concerns stay isolated. The DM (always) has assistant access; this flag
-- governs whether PLAYERS in the campaign may use the assistant (scoped to
-- their own character + general rules + player-visible world pages). Off by
-- default — the DM opts players in.

alter table public.campaigns
  add column if not exists ai_settings jsonb
  default jsonb_build_object('playerAccessEnabled', false);

-- Backfill any existing rows where the default didn't take (older inserts).
update public.campaigns
   set ai_settings = jsonb_build_object('playerAccessEnabled', false)
 where ai_settings is null;
