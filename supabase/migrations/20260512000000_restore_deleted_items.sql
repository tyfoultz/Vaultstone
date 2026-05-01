-- Recently Deleted — list + restore RPCs for soft-deleted world items.

-- List all soft-deleted items in a world (owner only).
-- Returns three result sets via composite return type.
create type public.deleted_page_item as (
  id uuid,
  title text,
  page_kind text,
  section_id uuid,
  section_name text,
  deleted_at timestamptz,
  hard_delete_after timestamptz
);

create type public.deleted_section_item as (
  id uuid,
  name text,
  template_key text,
  deleted_at timestamptz,
  hard_delete_after timestamptz
);

create type public.deleted_map_item as (
  id uuid,
  label text,
  deleted_at timestamptz,
  hard_delete_after timestamptz
);

create or replace function public.list_deleted_world_pages(p_world_id uuid)
returns setof deleted_page_item
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_world_owner(p_world_id) then
    raise exception 'not authorized';
  end if;

  return query
    select
      wp.id,
      wp.title,
      wp.page_kind,
      wp.section_id,
      coalesce(ws.name, '(deleted section)') as section_name,
      wp.deleted_at,
      wp.hard_delete_after
    from world_pages wp
    left join world_sections ws on ws.id = wp.section_id and ws.deleted_at is null
    where wp.world_id = p_world_id
      and wp.deleted_at is not null
    order by wp.deleted_at desc;
end;
$$;

create or replace function public.list_deleted_world_sections(p_world_id uuid)
returns setof deleted_section_item
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_world_owner(p_world_id) then
    raise exception 'not authorized';
  end if;

  return query
    select ws.id, ws.name, ws.template_key, ws.deleted_at, ws.hard_delete_after
    from world_sections ws
    where ws.world_id = p_world_id
      and ws.deleted_at is not null
    order by ws.deleted_at desc;
end;
$$;

create or replace function public.list_deleted_world_maps(p_world_id uuid)
returns setof deleted_map_item
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_world_owner(p_world_id) then
    raise exception 'not authorized';
  end if;

  return query
    select wm.id, wm.label, wm.deleted_at, wm.hard_delete_after
    from world_maps wm
    where wm.world_id = p_world_id
      and wm.deleted_at is not null
    order by wm.deleted_at desc;
end;
$$;

-- Restore a soft-deleted page. Re-parents to first live section if the
-- original section was also deleted.
create or replace function public.restore_world_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world uuid;
  v_section uuid;
  v_section_deleted timestamptz;
  v_fallback uuid;
begin
  select world_id, section_id into v_world, v_section
    from world_pages where id = p_page_id and deleted_at is not null;

  if v_world is null then
    raise exception 'page not found or not deleted';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  -- Check if the section is still alive
  select deleted_at into v_section_deleted
    from world_sections where id = v_section;

  if v_section_deleted is not null then
    -- Re-parent to first non-deleted section in this world
    select id into v_fallback
      from world_sections
      where world_id = v_world and deleted_at is null
      order by sort_order asc
      limit 1;

    if v_fallback is null then
      raise exception 'no live sections — restore the section first';
    end if;

    update world_pages
       set deleted_at = null,
           hard_delete_after = null,
           section_id = v_fallback,
           parent_page_id = null
     where id = p_page_id;
  else
    update world_pages
       set deleted_at = null,
           hard_delete_after = null
     where id = p_page_id;
  end if;
end;
$$;

create or replace function public.restore_world_section(p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world uuid;
begin
  select world_id into v_world
    from world_sections where id = p_section_id and deleted_at is not null;

  if v_world is null then
    raise exception 'section not found or not deleted';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  update world_sections
     set deleted_at = null,
         hard_delete_after = null
   where id = p_section_id;
end;
$$;

create or replace function public.restore_world_map(p_map_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world uuid;
begin
  select world_id into v_world
    from world_maps where id = p_map_id and deleted_at is not null;

  if v_world is null then
    raise exception 'map not found or not deleted';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  update world_maps
     set deleted_at = null,
         hard_delete_after = null
   where id = p_map_id;
end;
$$;

grant execute on function public.list_deleted_world_pages(uuid) to authenticated;
grant execute on function public.list_deleted_world_sections(uuid) to authenticated;
grant execute on function public.list_deleted_world_maps(uuid) to authenticated;
grant execute on function public.restore_world_page(uuid) to authenticated;
grant execute on function public.restore_world_section(uuid) to authenticated;
grant execute on function public.restore_world_map(uuid) to authenticated;
