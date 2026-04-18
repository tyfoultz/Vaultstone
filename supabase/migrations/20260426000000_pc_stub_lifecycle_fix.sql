-- Phase 4h fix — PC stub lifecycle keys off `campaign_members`, not
-- `characters.campaign_id`.
--
-- Original 4h migration (`20260425000000_pc_stub_lifecycle.sql`) looked up
-- a character's campaign through `characters.campaign_id`, but the app
-- records player↔campaign membership in the `campaign_members` join table
-- (with character_id nullable). Result: no stubs materialized in
-- production. This migration:
--
--  1. Changes `materialize_pc_stub` to take an explicit campaign_id
--     (instead of deriving it from `characters.campaign_id`).
--  2. Drops `tr_characters_create_stubs` — a bare character row without
--     a campaign_members entry has no world to materialize into.
--  3. Strips the campaign-move branch from `tr_characters_sync_stubs`
--     (membership moves live on `campaign_members`, not `characters`).
--  4. Rewrites `tr_world_campaigns_materialize_stubs` to query
--     `campaign_members` for the character list.
--  5. Adds `tr_campaign_members_sync_stubs` covering INSERT / UPDATE /
--     DELETE on the join table — the new primary driver of stub
--     lifecycle.

drop trigger if exists tr_characters_create_stubs on public.characters;
drop function if exists public.tr_characters_create_stubs();

-- Re-declare with explicit campaign_id parameter.
drop function if exists public.materialize_pc_stub(uuid, uuid);

create or replace function public.materialize_pc_stub(
  p_world_id      uuid,
  p_character_id  uuid,
  p_campaign_id   uuid
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
begin
  select id into v_section_id
  from public.world_sections
  where world_id = p_world_id
    and template_key = 'players'
    and deleted_at is null
  order by sort_order asc
  limit 1;

  if v_section_id is null then
    return;
  end if;

  select c.*
    into v_character
  from public.characters c
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
    p_campaign_id,
    true,
    v_next_sort
  )
  on conflict (world_id, character_id) where page_kind = 'pc_stub' and character_id is not null and deleted_at is null
  do update set
    is_orphaned = false,
    campaign_id = excluded.campaign_id,
    title       = case when world_pages.title_overridden then world_pages.title else excluded.title end,
    updated_at  = now();
end;
$$;

grant execute on function public.materialize_pc_stub(uuid, uuid, uuid) to authenticated;

-- Name sync only — campaign-move logic moved to the campaign_members
-- trigger below.
create or replace function public.tr_characters_sync_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.name is distinct from OLD.name then
    update public.world_pages
    set title = NEW.name,
        updated_at = now()
    where character_id = NEW.id
      and page_kind = 'pc_stub'
      and title_overridden = false
      and deleted_at is null;
  end if;

  return NEW;
end;
$$;

-- Rewrite world_campaigns INSERT to read the character list from
-- campaign_members (this is the real source of truth for who's playing
-- what on a campaign).
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
    select cm.character_id
    from public.campaign_members cm
    where cm.campaign_id = NEW.campaign_id
      and cm.character_id is not null
  loop
    perform public.materialize_pc_stub(NEW.world_id, v_character_id, NEW.campaign_id);
  end loop;
  return NEW;
end;
$$;

-- New driver: campaign_members lifecycle. Covers:
--   • INSERT with a character_id        → materialize stubs across every
--                                          world linked to that campaign.
--   • UPDATE that swaps character_id    → orphan the previous stub +
--                                          materialize the new one.
--   • UPDATE that clears character_id   → orphan the previous stub.
--   • DELETE with character_id set      → orphan the stub.
create or replace function public.tr_campaign_members_sync_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world_id      uuid;
  v_old_char      uuid;
  v_new_char      uuid;
  v_campaign_id   uuid;
begin
  if TG_OP = 'INSERT' then
    v_new_char    := NEW.character_id;
    v_campaign_id := NEW.campaign_id;
  elsif TG_OP = 'UPDATE' then
    v_old_char    := OLD.character_id;
    v_new_char    := NEW.character_id;
    v_campaign_id := NEW.campaign_id;
  else -- DELETE
    v_old_char    := OLD.character_id;
    v_campaign_id := OLD.campaign_id;
  end if;

  -- Orphan stubs for an outgoing character (UPDATE swap/clear or DELETE).
  if v_old_char is not null and v_old_char is distinct from v_new_char then
    update public.world_pages p
    set is_orphaned = true,
        updated_at  = now()
    where p.character_id = v_old_char
      and p.campaign_id  = v_campaign_id
      and p.page_kind    = 'pc_stub'
      and p.deleted_at is null;
  end if;

  -- Materialize stubs for an incoming character (INSERT or UPDATE
  -- swap/add) across every world linked to the campaign.
  if v_new_char is not null and v_new_char is distinct from v_old_char then
    for v_world_id in
      select wc.world_id
      from public.world_campaigns wc
      where wc.campaign_id = v_campaign_id
    loop
      perform public.materialize_pc_stub(v_world_id, v_new_char, v_campaign_id);
    end loop;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_campaign_members_sync_stubs on public.campaign_members;
create trigger tr_campaign_members_sync_stubs
after insert or update or delete on public.campaign_members
for each row
execute function public.tr_campaign_members_sync_stubs();
