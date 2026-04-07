-- =============================================================================
-- Epic 1 schema additions
-- campaigns: system_label, description, is_archived
-- campaign_members: role, character_id
-- =============================================================================


-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------

alter table campaigns
  add column if not exists system_label text,
  add column if not exists description  text,
  add column if not exists is_archived  boolean not null default false;

create index if not exists campaigns_is_archived_idx on campaigns(is_archived);


-- ---------------------------------------------------------------------------
-- campaign_members
-- ---------------------------------------------------------------------------

alter table campaign_members
  add column if not exists role         text not null default 'player'
                                        check (role in ('gm', 'player', 'co_gm')),
  add column if not exists character_id uuid references characters(id) on delete set null;

create index if not exists campaign_members_character_id_idx on campaign_members(character_id);


-- ---------------------------------------------------------------------------
-- RLS additions for new columns / operations
-- ---------------------------------------------------------------------------

-- Allow DM to update campaigns (join_code regeneration, archive, description edits)
-- Policy already exists from migration 003, but add is_archived to coverage — no change needed
-- since the existing update policy covers all columns.

-- Allow members to remove themselves (leave) or DM to remove others
-- The existing "campaign_members: leave" policy covers self-deletion.
-- Add a DM removal policy:
drop policy if exists "campaign_members: dm can remove" on campaign_members;
create policy "campaign_members: dm can remove"
  on campaign_members for delete
  using (is_campaign_dm(campaign_id));

-- Allow DM to update member roles (co_gm promotion)
drop policy if exists "campaign_members: dm can update role" on campaign_members;
create policy "campaign_members: dm can update role"
  on campaign_members for update
  using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Allow members to update their own character_id (character linking)
drop policy if exists "campaign_members: member can link character" on campaign_members;
create policy "campaign_members: member can link character"
  on campaign_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
