-- Allow DMs to UPDATE characters linked to their campaigns.
--
-- The existing UPDATE policy is owner-only (auth.uid() = user_id).
-- This adds a second UPDATE policy so DMs can edit any character whose
-- campaign_id points at a campaign they own. Uses the existing
-- is_campaign_dm() security-definer helper to avoid RLS recursion.

create policy "characters: dm can update party members"
  on characters for update
  using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));
