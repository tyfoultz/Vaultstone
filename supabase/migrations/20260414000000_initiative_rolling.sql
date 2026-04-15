-- Phase 2.5 — separate initiative modifier from the d20 roll and add a
-- combat lifecycle so Next Turn is only enabled once every combatant has
-- rolled. Also: a security-definer RPC so players can roll for their
-- own PC without needing INSERT/UPDATE privileges on initiative_order.

alter table public.initiative_order
  add column if not exists init_roll int null;

alter table public.sessions
  add column if not exists combat_started_at timestamptz null;

-- DM can always roll for any combatant in their campaign. A player can
-- roll for a combatant linked to a character they own. Everyone else
-- gets a not-allowed error.
create or replace function public.roll_combatant_initiative(
  combatant_id uuid,
  roll_value int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char_id    uuid;
  v_session_id uuid;
  v_campaign_id uuid;
  v_user       uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select character_id, session_id
    into v_char_id, v_session_id
    from public.initiative_order
   where id = combatant_id;
  if v_session_id is null then raise exception 'combatant not found'; end if;

  select campaign_id into v_campaign_id
    from public.sessions where id = v_session_id;

  if exists (
    select 1 from public.campaigns
     where id = v_campaign_id and dm_user_id = v_user
  ) then
    update public.initiative_order
       set init_roll = roll_value
     where id = combatant_id;
    return;
  end if;

  if v_char_id is not null and exists (
    select 1 from public.characters
     where id = v_char_id and user_id = v_user
  ) then
    update public.initiative_order
       set init_roll = roll_value
     where id = combatant_id;
    return;
  end if;

  raise exception 'not allowed';
end;
$$;

grant execute on function public.roll_combatant_initiative(uuid, int) to authenticated;
