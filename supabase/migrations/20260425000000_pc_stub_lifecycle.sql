-- Phase 4h — PC stub lifecycle triggers.
--
-- A PC stub is a placeholder page (`page_kind = 'pc_stub'`) that the world
-- auto-creates for every character on a linked campaign. When the player
-- fills in their backstory the stub is promoted to `page_kind =
-- 'player_character'` (Phase 7a enrichment flow). Between those two states
-- several lifecycle events can fire — character rename, character move,
-- campaign unlink, etc. — that need to keep the stub in sync without
-- losing DM enrichment. This migration wires the triggers + the columns
-- they need.
--
-- Deduplication key: `(world_id, character_id) WHERE page_kind = 'pc_stub'`.
-- Previously we deduped by `(world_id, pc_user_id)`, which broke when a
-- player had more than one character on the same campaign (or a PC moved
-- between campaigns that are both linked to the same world).

alter table public.world_pages
  add column if not exists character_id   uuid references public.characters(id) on delete set null,
  add column if not exists campaign_id    uuid references public.campaigns(id)  on delete set null,
  add column if not exists title_overridden boolean not null default false,
  add column if not exists is_orphaned     boolean not null default false;

create index if not exists world_pages_character_id_idx on public.world_pages (character_id);
create index if not exists world_pages_campaign_id_idx  on public.world_pages (campaign_id);

-- Replace the old pc_user_id-scoped partial uniqueness with character_id-scoped.
drop index if exists world_pages_pc_stub_unique;
create unique index if not exists world_pages_pc_stub_character_unique
  on public.world_pages (world_id, character_id)
  where page_kind = 'pc_stub' and character_id is not null and deleted_at is null;

-- Materialize a stub for a given character inside a given world. No-ops if
-- the world has no `players`-template section (we don't want to invent a
-- section on behalf of the GM; orphan/materialization is preferable).
-- Uses `ON CONFLICT DO UPDATE` so re-linking a previously orphaned stub
-- quietly clears `is_orphaned` without resurrecting stale enrichment.
create or replace function public.materialize_pc_stub(
  p_world_id      uuid,
  p_character_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id   uuid;
  v_character    record;
  v_next_sort    int;
  v_owner        uuid;
begin
  select id into v_section_id
  from public.world_sections
  where world_id = p_world_id
    and template_key = 'players'
    and deleted_at is null
  order by sort_order asc
  limit 1;

  if v_section_id is null then
    -- No Players section yet — skip silently. Phase 7a's enrichment flow
    -- will handle this when the GM adds a Players section later (the same
    -- function can be re-run from the 'link campaign' trigger).
    return;
  end if;

  select c.*, p.id as user_profile_id
    into v_character
  from public.characters c
  left join public.profiles p on p.id = c.user_id
  where c.id = p_character_id;

  if not found then
    return;
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_next_sort
  from public.world_pages
  where world_id = p_world_id
    and section_id = v_section_id
    and parent_page_id is null;

  insert into public.world_pages (
    world_id,
    section_id,
    title,
    page_kind,
    template_key,
    template_version,
    pc_user_id,
    character_id,
    campaign_id,
    visible_to_players,
    sort_order
  ) values (
    p_world_id,
    v_section_id,
    v_character.name,
    'pc_stub',
    'players',
    1,
    v_character.user_id,
    v_character.id,
    v_character.campaign_id,
    true,
    v_next_sort
  )
  on conflict (world_id, character_id) where page_kind = 'pc_stub' and character_id is not null and deleted_at is null
  do update set
    is_orphaned = false,
    -- Re-adopting: if the character rejoined the campaign, update its
    -- campaign linkage. Title only syncs when not overridden by the DM.
    campaign_id = excluded.campaign_id,
    title       = case when world_pages.title_overridden then world_pages.title else excluded.title end,
    updated_at  = now();
end;
$$;

grant execute on function public.materialize_pc_stub(uuid, uuid) to authenticated;

-- Trigger: when a character is created, materialize a stub in every world
-- linked to that character's campaign. Runs as security definer so the
-- INSERT bypasses world_pages RLS even when the character's owner isn't
-- the world owner.
create or replace function public.tr_characters_create_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world_id uuid;
begin
  for v_world_id in
    select wc.world_id
    from public.world_campaigns wc
    where wc.campaign_id = NEW.campaign_id
  loop
    perform public.materialize_pc_stub(v_world_id, NEW.id);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists tr_characters_create_stubs on public.characters;
create trigger tr_characters_create_stubs
after insert on public.characters
for each row
execute function public.tr_characters_create_stubs();

-- Trigger: when a character's name changes, sync the stub title unless the
-- DM has overridden it. Also handles campaign moves: if the character's
-- campaign_id changes, relink or orphan the stub depending on whether the
-- new campaign is linked to the same world.
create or replace function public.tr_characters_sync_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Name sync (only where title not overridden).
  if NEW.name is distinct from OLD.name then
    update public.world_pages
    set title = NEW.name,
        updated_at = now()
    where character_id = NEW.id
      and page_kind = 'pc_stub'
      and title_overridden = false
      and deleted_at is null;
  end if;

  -- Campaign move.
  if NEW.campaign_id is distinct from OLD.campaign_id then
    update public.world_pages p
    set is_orphaned = not exists (
          select 1 from public.world_campaigns wc
          where wc.world_id = p.world_id
            and wc.campaign_id = NEW.campaign_id
        ),
        campaign_id = NEW.campaign_id,
        updated_at = now()
    where p.character_id = NEW.id
      and p.page_kind = 'pc_stub'
      and p.deleted_at is null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tr_characters_sync_stubs on public.characters;
create trigger tr_characters_sync_stubs
after update on public.characters
for each row
execute function public.tr_characters_sync_stubs();

-- Trigger: on character delete, flag stubs orphaned. The FK on
-- `character_id` is `on delete set null`, so after this trigger the
-- character_id is nulled; we preserve campaign_id / pc_user_id so the DM
-- can still restore enrichment manually.
create or replace function public.tr_characters_orphan_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.world_pages
  set is_orphaned = true,
      updated_at = now()
  where character_id = OLD.id
    and page_kind = 'pc_stub'
    and deleted_at is null;
  return OLD;
end;
$$;

drop trigger if exists tr_characters_orphan_stubs on public.characters;
create trigger tr_characters_orphan_stubs
before delete on public.characters
for each row
execute function public.tr_characters_orphan_stubs();

-- Trigger: on world_campaigns INSERT, materialize stubs for every existing
-- character on that campaign.
create or replace function public.tr_world_campaigns_materialize_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_id uuid;
begin
  for v_character_id in
    select c.id from public.characters c where c.campaign_id = NEW.campaign_id
  loop
    perform public.materialize_pc_stub(NEW.world_id, v_character_id);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists tr_world_campaigns_materialize_stubs on public.world_campaigns;
create trigger tr_world_campaigns_materialize_stubs
after insert on public.world_campaigns
for each row
execute function public.tr_world_campaigns_materialize_stubs();

-- Trigger: on world_campaigns DELETE (unlink), flag stubs orphaned.
create or replace function public.tr_world_campaigns_orphan_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.world_pages
  set is_orphaned = true,
      updated_at = now()
  where world_id = OLD.world_id
    and campaign_id = OLD.campaign_id
    and page_kind = 'pc_stub'
    and deleted_at is null;
  return OLD;
end;
$$;

drop trigger if exists tr_world_campaigns_orphan_stubs on public.world_campaigns;
create trigger tr_world_campaigns_orphan_stubs
after delete on public.world_campaigns
for each row
execute function public.tr_world_campaigns_orphan_stubs();
