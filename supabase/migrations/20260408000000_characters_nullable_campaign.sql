-- Allow characters to exist without a campaign (standalone draft state).
-- campaign_id is set when the character is linked to a campaign (Phase 5).
-- RLS is unaffected: is_campaign_dm(null) returns false, so unlinked characters
-- are only visible to their owner via the existing `auth.uid() = user_id` check.

alter table characters
  alter column campaign_id drop not null;
