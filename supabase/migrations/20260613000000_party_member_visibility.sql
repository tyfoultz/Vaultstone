-- =============================================================================
-- Let campaign members see each other's membership rows.
--
-- Before this migration, campaign_members had a single SELECT policy
-- ("campaign_members: read own") that restricted users to their own row:
--
--   create policy "campaign_members: read own"
--     on campaign_members for select
--     using (auth.uid() = user_id);
--
-- The party tab on the campaign view fetches every membership row + linked
-- character via:
--
--   from('campaign_members')
--     .select('user_id, role, character_id, ..., characters(...)')
--     .eq('campaign_id', campaignId)
--
-- With the old policy this returned only the viewer's own row, so the
-- party list silently showed just yourself. Adding a second policy that
-- opens visibility within the campaign (via the existing
-- is_campaign_member security-definer helper) makes the party list
-- return every player + the DM.
--
-- The "read own" policy stays in place so members can still see their
-- own row in flows where they aren't (yet) part of the campaign — the
-- two policies OR-combine.
-- =============================================================================

drop policy if exists "campaign_members: read campaign peers" on campaign_members;
create policy "campaign_members: read campaign peers"
  on campaign_members for select
  using (is_campaign_member(campaign_id));
