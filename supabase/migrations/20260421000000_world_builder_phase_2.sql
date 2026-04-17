-- Feature 9 — World Builder Phase 2 (Sections + Pages + Templates)
-- Adds world_sections + world_pages, extends create_world_with_owner to
-- atomically seed four starter sections, introduces soft-delete RPCs with
-- recursive cascade, and completes the forward-declared worlds FK for
-- primary_timeline_page_id.

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists world_sections (
  id                         uuid primary key default gen_random_uuid(),
  world_id                   uuid not null references worlds(id) on delete cascade,
  name                       text not null check (length(trim(name)) > 0),
  template_key               text not null check (
    template_key in ('locations','npcs','players','factions','lore','blank')
  ),
  section_view               text not null default 'list' check (section_view in ('grid','list')),
  sort_order                 int  not null default 0,
  force_hidden_from_players  boolean not null default false,
  default_pages_visible      boolean not null default true,
  deleted_at                 timestamptz,
  hard_delete_after          timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists world_sections_world_idx
  on world_sections(world_id, sort_order)
  where deleted_at is null;

drop trigger if exists world_sections_updated_at on world_sections;
create trigger world_sections_updated_at
  before update on world_sections
  for each row execute function handle_updated_at();

create table if not exists world_pages (
  id                 uuid primary key default gen_random_uuid(),
  world_id           uuid not null references worlds(id) on delete cascade,
  section_id         uuid not null references world_sections(id) on delete cascade,
  parent_page_id     uuid references world_pages(id) on delete cascade,
  title              text not null check (length(trim(title)) > 0),
  page_kind          text not null check (
    page_kind in (
      'custom','location','npc','faction','religion','organization','item',
      'lore','timeline','pc_stub','player_character'
    )
  ),
  template_key       text not null,
  template_version   int  not null,
  body               jsonb not null default '{}'::jsonb,
  body_text          text,
  body_refs          uuid[] not null default '{}',
  structured_fields  jsonb not null default '{}'::jsonb,
  visible_to_players boolean not null default true,
  sort_order         int  not null default 0,
  pc_user_id         uuid references profiles(id) on delete set null,
  editing_user_id    uuid references profiles(id) on delete set null,
  editing_since      timestamptz,
  deleted_at         timestamptz,
  hard_delete_after  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists world_pages_sidebar_idx
  on world_pages(world_id, section_id, parent_page_id, sort_order)
  where deleted_at is null;

create index if not exists world_pages_parent_idx
  on world_pages(parent_page_id)
  where deleted_at is null;

create index if not exists world_pages_body_refs_gin
  on world_pages using gin (body_refs);

create index if not exists world_pages_structured_gin
  on world_pages using gin (structured_fields);

create unique index if not exists world_pages_pc_stub_unique
  on world_pages(world_id, pc_user_id)
  where page_kind = 'pc_stub' and deleted_at is null;

drop trigger if exists world_pages_updated_at on world_pages;
create trigger world_pages_updated_at
  before update on world_pages
  for each row execute function handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Forward-declared FK on worlds.primary_timeline_page_id
-- Phase 1 left this column unreferenced; Phase 6 will populate it.
-- ─────────────────────────────────────────────────────────────────────────

alter table worlds
  drop constraint if exists worlds_primary_timeline_page_fk;

alter table worlds
  add constraint worlds_primary_timeline_page_fk
  foreign key (primary_timeline_page_id)
  references world_pages(id)
  on delete set null
  deferrable initially deferred;

-- ─────────────────────────────────────────────────────────────────────────
-- Extended atomic create RPC
-- Replaces Phase 1 body. Atomically inserts four starter sections alongside
-- the world so new worlds are never rendered empty.
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

  insert into world_sections (world_id, name, template_key, section_view, sort_order) values
    (v_world.id, 'Locations', 'locations', 'grid', 0),
    (v_world.id, 'NPCs',      'npcs',      'list', 1),
    (v_world.id, 'Players',   'players',   'list', 2),
    (v_world.id, 'World Map', 'blank',     'list', 3);

  if p_campaign_ids is not null then
    foreach v_cid in array p_campaign_ids loop
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
-- Trash RPCs (soft-delete with 30-day hard-delete window + cascade)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.trash_world_section(p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world uuid;
  v_now   timestamptz := now();
begin
  select world_id into v_world from world_sections where id = p_section_id;
  if v_world is null then
    raise exception 'section not found';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  update world_sections
     set deleted_at = v_now,
         hard_delete_after = v_now + interval '30 days'
   where id = p_section_id
     and deleted_at is null;

  update world_pages
     set deleted_at = v_now,
         hard_delete_after = v_now + interval '30 days'
   where section_id = p_section_id
     and deleted_at is null;
end;
$$;

grant execute on function public.trash_world_section(uuid) to authenticated;

create or replace function public.trash_world_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world uuid;
  v_now   timestamptz := now();
begin
  select world_id into v_world from world_pages where id = p_page_id;
  if v_world is null then
    raise exception 'page not found';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  with recursive subtree as (
    select id from world_pages where id = p_page_id
    union all
    select wp.id from world_pages wp
      join subtree s on wp.parent_page_id = s.id
  )
  update world_pages
     set deleted_at = v_now,
         hard_delete_after = v_now + interval '30 days'
   where id in (select id from subtree)
     and deleted_at is null;
end;
$$;

grant execute on function public.trash_world_page(uuid) to authenticated;

create or replace function public.move_world_page(
  p_page_id        uuid,
  p_new_section_id uuid,
  p_new_parent_id  uuid,
  p_new_sort_order int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world         uuid;
  v_target_world  uuid;
  v_parent_world  uuid;
begin
  select world_id into v_world from world_pages where id = p_page_id;
  if v_world is null then
    raise exception 'page not found';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  select world_id into v_target_world from world_sections where id = p_new_section_id;
  if v_target_world is null or v_target_world <> v_world then
    raise exception 'target section must belong to the same world';
  end if;

  if p_new_parent_id is not null then
    select world_id into v_parent_world from world_pages where id = p_new_parent_id;
    if v_parent_world is null or v_parent_world <> v_world then
      raise exception 'new parent must belong to the same world';
    end if;

    -- reject cycles: new parent cannot be the page itself or a descendant
    if p_new_parent_id = p_page_id then
      raise exception 'cannot parent a page to itself';
    end if;

    if exists (
      with recursive descendants as (
        select id from world_pages where parent_page_id = p_page_id
        union all
        select wp.id from world_pages wp
          join descendants d on wp.parent_page_id = d.id
      )
      select 1 from descendants where id = p_new_parent_id
    ) then
      raise exception 'cannot move page under its own descendant';
    end if;
  end if;

  update world_pages
     set section_id     = p_new_section_id,
         parent_page_id = p_new_parent_id,
         sort_order     = p_new_sort_order
   where id = p_page_id;
end;
$$;

grant execute on function public.move_world_page(uuid, uuid, uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table world_sections enable row level security;
alter table world_pages    enable row level security;

drop policy if exists world_sections_owner_all on world_sections;
create policy world_sections_owner_all on world_sections
  for all
  using (is_world_owner(world_id))
  with check (is_world_owner(world_id));

drop policy if exists world_sections_linked_member_select on world_sections;
create policy world_sections_linked_member_select on world_sections
  for select
  using (
    deleted_at is null
    and force_hidden_from_players = false
    and exists (
      select 1 from world_campaigns wc
      where wc.world_id = world_sections.world_id
        and is_campaign_member(wc.campaign_id)
    )
  );

drop policy if exists world_pages_owner_all on world_pages;
create policy world_pages_owner_all on world_pages
  for all
  using (is_world_owner(world_id))
  with check (is_world_owner(world_id));

drop policy if exists world_pages_linked_member_select on world_pages;
create policy world_pages_linked_member_select on world_pages
  for select
  using (
    deleted_at is null
    and visible_to_players = true
    and exists (
      select 1 from world_sections ws
      where ws.id = world_pages.section_id
        and ws.deleted_at is null
        and ws.force_hidden_from_players = false
    )
    and exists (
      select 1 from world_campaigns wc
      where wc.world_id = world_pages.world_id
        and is_campaign_member(wc.campaign_id)
    )
  );
