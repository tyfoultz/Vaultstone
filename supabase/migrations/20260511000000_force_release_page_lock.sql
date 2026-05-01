-- Owner-only force-release of another user's edit lock.
-- Normal release_world_page_edit only clears your own lock (or stale ones).
-- This lets the world owner immediately reclaim a page that a disconnected
-- editor still holds within the 90-second TTL window.

create or replace function public.force_release_world_page_edit(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_world uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select world_id into v_world
    from world_pages
   where id = p_page_id and deleted_at is null;

  if v_world is null then
    raise exception 'page not found';
  end if;

  if not is_world_owner(v_world) then
    raise exception 'only the world owner can force-release a lock';
  end if;

  update world_pages
     set editing_user_id = null,
         editing_since   = null
   where id = p_page_id;
end;
$$;

grant execute on function public.force_release_world_page_edit(uuid) to authenticated;
