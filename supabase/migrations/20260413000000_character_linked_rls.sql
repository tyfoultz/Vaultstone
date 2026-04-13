-- =============================================================================
-- Allow campaign members to read characters linked to the same campaign.
--
-- Previously, characters were readable only by their owner or the campaign DM
-- (via characters.campaign_id). Now that linking happens through
-- campaign_members.character_id (nullable, standalone characters), we need a
-- second SELECT policy that opens read access for any campaign member whose
-- campaign has a member with that character linked.
-- =============================================================================

drop policy if exists "characters: campaign members can read linked" on characters;
create policy "characters: campaign members can read linked"
  on characters for select
  using (
    exists (
      select 1
      from campaign_members cm_viewer
      join campaign_members cm_linked
        on cm_linked.campaign_id = cm_viewer.campaign_id
       and cm_linked.character_id = characters.id
      where cm_viewer.user_id = auth.uid()
    )
  );
