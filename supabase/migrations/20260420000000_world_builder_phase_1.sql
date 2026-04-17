-- Feature 9 — World Builder Phase 1 (Foundation)
-- Worlds + world↔campaign links, owner helper, atomic create RPC, RLS.

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists worlds (
  id                       uuid primary key default gen_random_uuid(),
  owner_user_id            uuid not null references profiles(id) on delete cascade,
  name                     text not null check (length(trim(name)) > 0),
  description              text,
  cover_image_url          text,
  primary_map_id           uuid,
  primary_timeline_page_id uuid,
  is_archived              boolean not null default false,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists worlds_owner_idx
  on worlds(owner_user_id)
  where deleted_at is null;

create trigger worlds_updated_at
  before update on worlds
  for each row execute function handle_updated_at();

create table if not exists world_campaigns (
  world_id    uuid not null references worlds(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (world_id, campaign_id)
);

create index if not exists world_campaigns_campaign_idx
  on world_campaigns(campaign_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Security-definer helper
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.is_world_owner(p_world_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from worlds w
    where w.id = p_world_id
      and w.owner_user_id = auth.uid()
      and w.deleted_at is null
  );
$$;

grant execute on function public.is_world_owner(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Atomic create RPC
-- Mirrors create_campaign_with_gm pattern — sidesteps RLS RETURNING re-eval
-- and keeps the create+link flow atomic.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_world_with_owner(
  p_name         text,
  p_description  text default null,
  p_campaign_ids uuid[] default null
) returns worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_world worlds;
  v_cid   uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'world name is required';
  end if;

  insert into worlds (owner_user_id, name, description)
       values (v_user, trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
    returning * into v_world;

  if p_campaign_ids is not null then
    foreach v_cid in array p_campaign_ids loop
      -- silently skip campaigns the user doesn't DM
      if is_campaign_dm(v_cid) then
        insert into world_campaigns (world_id, campaign_id)
             values (v_world.id, v_cid)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_world;
end;
$$;

grant execute on function public.create_world_with_owner(text, text, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table worlds          enable row level security;
alter table world_campaigns enable row level security;

-- Worlds: owner has full access; members of a linked campaign can SELECT.
drop policy if exists worlds_owner_all on worlds;
create policy worlds_owner_all on worlds
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists worlds_linked_member_select on worlds;
create policy worlds_linked_member_select on worlds
  for select
  using (
    exists (
      select 1 from world_campaigns wc
      where wc.world_id = worlds.id
        and is_campaign_member(wc.campaign_id)
    )
  );

-- world_campaigns: world owner manages; campaign members can SELECT to know their links.
drop policy if exists world_campaigns_owner_all on world_campaigns;
create policy world_campaigns_owner_all on world_campaigns
  for all
  using (is_world_owner(world_id))
  with check (is_world_owner(world_id));

drop policy if exists world_campaigns_member_select on world_campaigns;
create policy world_campaigns_member_select on world_campaigns
  for select
  using (is_campaign_member(campaign_id));
