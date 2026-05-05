-- Enable unaccent extension for diacritic-insensitive search
-- (e.g. searching "durnhal" matches "Dûrnhal Deep")

create extension if not exists unaccent schema public;

-- Replace search_world to use unaccent() on both query and searched columns

create or replace function public.search_world(
  p_world_id   uuid,
  p_query      text,
  p_limit      integer default 10,
  p_offset     integer default 0
)
returns table (
  result_type  text,
  id           uuid,
  world_id     uuid,
  title        text,
  preview      text,
  section_name text,
  page_kind    text,
  is_orphaned  boolean,
  visible_to_players boolean,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Pages: match on title, structured_fields, body_text
  (
    select
      'page'::text as result_type,
      wp.id,
      wp.world_id,
      wp.title,
      coalesce(
        left(wp.body_text, 120),
        ''
      ) as preview,
      coalesce(ws.name, '') as section_name,
      wp.page_kind::text,
      wp.is_orphaned,
      wp.visible_to_players,
      wp.updated_at
    from world_pages wp
    left join world_sections ws on ws.id = wp.section_id
    where wp.world_id = p_world_id
      and wp.deleted_at is null
      and (
        unaccent(wp.title) ilike '%' || unaccent(p_query) || '%'
        or unaccent(coalesce(wp.body_text, '')) ilike '%' || unaccent(p_query) || '%'
        or wp.structured_fields::text ilike '%' || p_query || '%'
      )
    order by
      case when unaccent(wp.title) ilike '%' || unaccent(p_query) || '%' then 0 else 1 end,
      wp.updated_at desc
  )
  union all
  -- Map pins: match on label
  (
    select
      'pin'::text as result_type,
      mp.id,
      mp.world_id,
      coalesce(mp.label, '') as title,
      '' as preview,
      '' as section_name,
      'pin'::text as page_kind,
      false as is_orphaned,
      true as visible_to_players,
      mp.updated_at
    from map_pins mp
    where mp.world_id = p_world_id
      and unaccent(coalesce(mp.label, '')) ilike '%' || unaccent(p_query) || '%'
  )
  union all
  -- Timeline events: match on title
  (
    select
      'event'::text as result_type,
      te.id,
      te.world_id,
      te.title,
      coalesce(left(te.body_text, 120), '') as preview,
      '' as section_name,
      'timeline_event'::text as page_kind,
      false as is_orphaned,
      te.visible_to_players,
      te.updated_at
    from timeline_events te
    where te.world_id = p_world_id
      and te.deleted_at is null
      and unaccent(te.title) ilike '%' || unaccent(p_query) || '%'
  )
  limit p_limit
  offset p_offset;
$$;
