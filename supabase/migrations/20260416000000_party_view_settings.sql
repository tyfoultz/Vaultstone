-- Per-campaign DM controls for what players see of each other in the
-- Party View: HP numbers, conditions, spell slots, class resources, and
-- whether players can tap into each other's sheets.

alter table public.campaigns
  add column if not exists party_view_settings jsonb
  default jsonb_build_object(
    'showHpNumbersToPlayers', true,
    'showConditionsToPlayers', true,
    'showSlotsToPlayers', true,
    'showResourcesToPlayers', true,
    'allowPlayerCrossView', false
  );

-- Backfill any existing rows where the default didn't take (older inserts).
update public.campaigns
   set party_view_settings = jsonb_build_object(
     'showHpNumbersToPlayers', true,
     'showConditionsToPlayers', true,
     'showSlotsToPlayers', true,
     'showResourcesToPlayers', true,
     'allowPlayerCrossView', false
   )
 where party_view_settings is null;
