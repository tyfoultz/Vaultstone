-- Atomically create a campaign + its GM membership row in a single RPC,
-- and transparently retry on join_code collisions.
--
-- Replaces the client-side two-step insert in
-- packages/api/src/campaigns.ts::createCampaign, which had three issues:
--
--   1. Two round-trips, non-atomic. A failure on the campaign_members
--      insert (RLS, FK, network) left an orphan campaign behind.
--
--   2. The post-insert lookup fetches the new row by join_code. On the
--      rare collision (join_code has a unique constraint; 36^6 ≈ 2.2B
--      keyspace), .single() would throw because two rows share the code.
--
--   3. INSERT ... RETURNING evaluates the SELECT policy during the
--      RETURNING clause, which has been fragile historically with the
--      security-definer helpers (see CLAUDE.md "RLS Gotchas"). Doing
--      everything server-side in a security-definer function sidesteps
--      that entirely.
--
-- auth.uid() is resolved inside the function so the caller does not
-- supply the DM user id — one less thing the client can get wrong.
--
-- Return type is `campaigns` (the row), so PostgREST serializes it back
-- to the client just like a plain select.
--
-- Follow-up: once applied, refactor packages/api/src/campaigns.ts to
-- call this RPC instead of the two-step insert + lookup. Ship as a
-- separate commit so the client and DB are easy to roll back
-- independently if anything misbehaves in preview.

drop function if exists public.create_campaign_with_gm(text, text, text);

create or replace function public.create_campaign_with_gm(
  p_name          text,
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

  -- Retry on join_code unique_violation. 10 attempts against a 2.2B
  -- keyspace is effectively unbounded even with millions of live codes.
  for v_attempt in 1..10 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * 36)::int, 1);
    end loop;

    begin
      insert into campaigns (name, dm_user_id, join_code, system_label, description)
           values (
             trim(p_name),
             v_user,
             v_code,
             nullif(trim(coalesce(p_system_label, '')), ''),
             nullif(trim(coalesce(p_description,  '')), '')
           )
        returning * into v_campaign;
      exit;
    exception when unique_violation then
      if v_attempt = 10 then
        raise exception 'failed to allocate join code after 10 attempts';
      end if;
      -- else fall through to the next iteration and retry
    end;
  end loop;

  -- GM membership. If this fails (RLS, FK, anything), the enclosing
  -- transaction rolls back the campaign insert too — no orphan rows.
  insert into campaign_members (campaign_id, user_id, role)
       values (v_campaign.id, v_user, 'gm');

  return v_campaign;
end;
$$;

grant execute on function public.create_campaign_with_gm(text, text, text) to authenticated;
