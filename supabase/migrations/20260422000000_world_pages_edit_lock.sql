-- Feature 9 Phase 3c — page edit-lock heartbeat.
--
-- editing_user_id + editing_since were added in Phase 2 but inert. This
-- migration ships the RPCs that drive them. The contract:
--
--   * claim_world_page_edit(p_page_id) — succeeds if no other user holds
--     a fresh lock; returns the row with editing_user_id = auth.uid().
--     A lock is "fresh" if editing_since > now() - interval '90 seconds'.
--   * release_world_page_edit(p_page_id) — clears the lock if it's mine
--     (or stale); silent no-op otherwise.
--
-- The client claims on mount, releases on unmount, and re-claims every
-- ~30 seconds as a heartbeat. The 90s TTL is deliberately ~3x the heartbeat
-- so a brief network blip doesn't surrender the lock.

create or replace function public.claim_world_page_edit(p_page_id uuid)
returns world_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_world  uuid;
  v_owner  uuid;
  v_since  timestamptz;
  v_row    world_pages;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select world_id, editing_user_id, editing_since
    into v_world, v_owner, v_since
    from world_pages
   where id = p_page_id and deleted_at is null;

  if v_world is null then
    raise exception 'page not found';
  end if;
  if not is_world_owner(v_world) then
    raise exception 'not authorized';
  end if;

  if v_owner is not null
     and v_owner <> v_user
     and v_since > now() - interval '90 seconds'
  then
    raise exception 'page is locked by another editor';
  end if;

  update world_pages
     set editing_user_id = v_user,
         editing_since   = now()
   where id = p_page_id
   returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.release_world_page_edit(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
  v_since timestamptz;
  v_world uuid;
begin
  if v_user is null then return; end if;

  select world_id, editing_user_id, editing_since
    into v_world, v_owner, v_since
    from world_pages
   where id = p_page_id;

  if v_world is null then return; end if;
  if not is_world_owner(v_world) then return; end if;

  -- Only clear if it's mine, or stale (someone else's lock that expired).
  if v_owner = v_user
     or v_owner is null
     or v_since <= now() - interval '90 seconds'
  then
    update world_pages
       set editing_user_id = null,
           editing_since   = null
     where id = p_page_id;
  end if;
end;
$$;

grant execute on function public.claim_world_page_edit(uuid)   to authenticated;
grant execute on function public.release_world_page_edit(uuid) to authenticated;
