-- =============================================================================
-- Let campaign members read every character whose campaign_id points
-- at a campaign they belong to.
--
-- The earlier "characters: campaign members can read linked" policy
-- (20260413000000) only opened SELECT when the character was also
-- linked via campaign_members.character_id. That covered the happy
-- path — wizard-created characters that set both campaign_id AND
-- campaign_members.character_id atomically — but missed a real-world
-- case: a player creates a character via the standalone characters
-- list, sets only characters.campaign_id, and never updates their
-- membership row. The character appears in the DM's view (the
-- "owner or dm" policy covers them via campaigns.dm_user_id) but
-- stays invisible to the other players, who only get the "linked"
-- policy.
--
-- This policy widens the read for fellow players: any character with
-- campaign_id pointing at a campaign you're a member of is readable.
-- Combined with the existing policies, the SELECT matrix becomes:
--   - owner               → always
--   - DM of campaign      → always
--   - peer in campaign    → when campaign_id OR campaign_members link
--                           connects them to a shared campaign
-- =============================================================================

drop policy if exists "characters: campaign members can read campaign characters"
  on characters;
create policy "characters: campaign members can read campaign characters"
  on characters for select
  using (
    characters.campaign_id is not null
    and is_campaign_member(characters.campaign_id)
  );
