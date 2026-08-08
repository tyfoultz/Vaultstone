-- Removing a player from a campaign is two writes that must land
-- together, and the client can't do the first one.
--
-- The client used to just DELETE the `campaign_members` row. That left
-- `characters.campaign_id` still pointing at the campaign, which is
-- worse than a cosmetic leak:
--
--   • `get_characters_for_campaign_trimmed` selects on that column
--     alone, so the removed player's character kept rendering in the
--     DM's Members and Party lists.
--   • `is_campaign_member` treats "owns a character whose campaign_id
--     is this campaign" as membership, so the removed player retained
--     read access to the campaign and its contents. Removal didn't
--     actually remove them.
--
-- The client can't fix this itself: the `characters: dm can update
-- party members` policy re-evaluates `is_campaign_dm(campaign_id)` in
-- WITH CHECK against the *new* row, and `is_campaign_dm(null)` is
-- false — so a DM nulling the column is always rejected. Hence a
-- security-definer RPC that owns both writes and authorizes explicitly.

create or replace function public.remove_campaign_member(
  p_campaign_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The campaign's DM removing a player, or a player leaving on their
  -- own. Nothing else.
  if not (public.is_campaign_dm(p_campaign_id) or auth.uid() = p_user_id) then
    raise exception 'not authorized to remove this member'
      using errcode = '42501';
  end if;

  -- The owner can't be removed through this path — that would orphan
  -- the campaign. Deleting the campaign is the DM's exit.
  if exists (
    select 1 from campaigns
    where id = p_campaign_id and dm_user_id = p_user_id
  ) then
    raise exception 'cannot remove the campaign owner'
      using errcode = '42501';
  end if;

  -- Detach first, then drop membership. The character itself survives;
  -- it just stops belonging to this campaign.
  update characters
  set campaign_id = null
  where campaign_id = p_campaign_id
    and user_id = p_user_id;

  delete from campaign_members
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_campaign_member(uuid, uuid) from public;
grant execute on function public.remove_campaign_member(uuid, uuid) to authenticated;
