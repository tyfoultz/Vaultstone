-- Phase 1: tie campaigns to a specific game system + introduce a join
-- table for which homebrew packs apply to which campaigns.
--
-- Background: characters already carry a `system` FK to game_systems, but
-- campaigns only had a free-text `system_label`. Linking the campaign
-- itself to a system unlocks: locking character creation in that campaign
-- to the campaign's ruleset, filtering content pickers, and surfacing
-- "this campaign's packs" without having to infer it from member chars.
--
-- Edition rows: the front-end exposes dnd5e_2014 and dnd5e_2024 as
-- separate systems, but the DB has historically stored just `dnd5e`
-- (which legacy code treats as the 2024 default). We add the explicit
-- edition rows so campaigns can pick correctly; the legacy `dnd5e` row
-- stays as a backwards-compat alias for existing characters. New rows
-- should use the explicit ids.

-- 1. Seed the missing edition rows. ON CONFLICT keeps this idempotent if
--    a future migration adds the same rows.
insert into game_systems (id, display_name, version, license, is_bundled, definition)
values
  ('dnd5e_2014', 'D&D 5e (2014)', '5.1', 'CC-BY-4.0', true, '{}'::jsonb),
  ('dnd5e_2024', 'D&D 5e (2024)', '5.2', 'CC-BY-4.0', true, '{}'::jsonb)
on conflict (id) do nothing;

-- 2. Add the system column on campaigns. Default to 'dnd5e' so existing
--    rows get a value (they all reference the legacy alias, which is
--    fine — the UI surfaces the version-specific rows for new campaigns,
--    and old campaigns keep working). NOT NULL after the default
--    populates.
alter table campaigns
  add column system text not null default 'dnd5e' references game_systems(id);

-- The default served its purpose for the backfill; drop it so future
-- inserts must specify a system explicitly.
alter table campaigns
  alter column system drop default;

create index campaigns_system_idx on campaigns(system);

-- 3. campaign_packs join table — which homebrew packs are enabled for
--    which campaign. RLS scopes:
--      - The DM (campaign owner) and campaign members can read the rows
--        (they need to know what content applies).
--      - Only the DM can insert/update/delete (toggle packs on/off).
--      - The pack itself must be system-compatible with the campaign;
--        a CHECK constraint via trigger would be ideal but we keep it
--        simple here and validate in the API layer.
create table campaign_packs (
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  pack_id      uuid not null references homebrew_packs(id) on delete cascade,
  enabled      boolean not null default true,
  added_at     timestamptz not null default now(),
  primary key (campaign_id, pack_id)
);

create index campaign_packs_campaign_id_idx on campaign_packs(campaign_id);
create index campaign_packs_pack_id_idx     on campaign_packs(pack_id);

alter table campaign_packs enable row level security;

-- Read: DM or any character owner in the campaign.
create policy "campaign_packs: members can read"
  on campaign_packs for select
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and (
          campaigns.dm_user_id = auth.uid()
          or exists (
            select 1 from characters
            where characters.campaign_id = campaigns.id
              and characters.user_id = auth.uid()
          )
        )
    )
  );

create policy "campaign_packs: dm can insert"
  on campaign_packs for insert
  with check (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "campaign_packs: dm can update"
  on campaign_packs for update
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "campaign_packs: dm can delete"
  on campaign_packs for delete
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

-- 4. Update the create_campaign_with_gm RPC to take a system. We replace
--    the old signature with a new one — clients pass the system id from
--    the system picker. system_label stays for backwards-compat display
--    but isn't authoritative anymore.
drop function if exists public.create_campaign_with_gm(text, text, text);

create or replace function public.create_campaign_with_gm(
  p_name          text,
  p_system        text,
  p_system_label  text default null,
  p_description   text default null
) returns campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_chars     text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_code      text;
  v_campaign  campaigns;
  v_attempt   int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'campaign name is required';
  end if;

  if p_system is null or length(trim(p_system)) = 0 then
    raise exception 'game system is required';
  end if;

  -- Validate system exists.
  if not exists (select 1 from game_systems where id = p_system) then
    raise exception 'unknown game system: %', p_system;
  end if;

  for v_attempt in 1..10 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * 36)::int, 1);
    end loop;

    begin
      insert into campaigns (name, dm_user_id, join_code, system, system_label, description)
           values (
             trim(p_name),
             v_user,
             v_code,
             p_system,
             nullif(trim(coalesce(p_system_label, '')), ''),
             nullif(trim(coalesce(p_description,  '')), '')
           )
        returning * into v_campaign;
      exit;
    exception when unique_violation then
      if v_attempt = 10 then
        raise exception 'failed to allocate join code after 10 attempts';
      end if;
    end;
  end loop;

  insert into campaign_members (campaign_id, user_id, role)
       values (v_campaign.id, v_user, 'gm');

  return v_campaign;
end;
$$;

grant execute on function public.create_campaign_with_gm(text, text, text, text) to authenticated;
