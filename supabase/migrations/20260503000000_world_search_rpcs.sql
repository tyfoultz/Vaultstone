-- Phase 7c: Full-text search RPCs for world pages, pins, and timeline events.
-- Two entry points: search within a single world, and search across all worlds
-- linked to a given campaign.

-- ─────────────────────────────────────────────────────────────────────────
-- search_world — search within a single world
-- ─────────────────────────────────────────────────────────────────────────

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
        wp.title ilike '%' || p_query || '%'
        or wp.body_text ilike '%' || p_query || '%'
        or wp.structured_fields::text ilike '%' || p_query || '%'
      )
    order by
      case when wp.title ilike '%' || p_query || '%' then 0 else 1 end,
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
      and mp.label ilike '%' || p_query || '%'
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
      and te.title ilike '%' || p_query || '%'
  )
  limit p_limit
  offset p_offset;
$$;

grant execute on function public.search_world(uuid, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- search_campaign_worlds — search across all worlds linked to a campaign
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.search_campaign_worlds(
  p_campaign_id uuid,
  p_query       text,
  p_limit       integer default 10,
  p_offset      integer default 0
)
returns table (
  result_type  text,
  id           uuid,
  world_id     uuid,
  world_name   text,
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
  select
    sr.result_type,
    sr.id,
    sr.world_id,
    w.name as world_name,
    sr.title,
    sr.preview,
    sr.section_name,
    sr.page_kind,
    sr.is_orphaned,
    sr.visible_to_players,
    sr.updated_at
  from world_campaigns wc
  join worlds w on w.id = wc.world_id
  cross join lateral search_world(wc.world_id, p_query, p_limit, p_offset) sr
  where wc.campaign_id = p_campaign_id
    and w.deleted_at is null
  order by sr.updated_at desc
  limit p_limit
  offset p_offset;
$$;

grant execute on function public.search_campaign_worlds(uuid, text, integer, integer) to authenticated;
