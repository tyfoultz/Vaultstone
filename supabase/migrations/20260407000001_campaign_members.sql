-- =============================================================================
-- Campaign Members
-- Tracks player membership in campaigns independently of character creation.
-- This allows players to join a campaign (via join code) before creating a character,
-- and enables the campaign list to show all joined campaigns immediately.
-- =============================================================================

create table campaign_members (
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index campaign_members_user_id_idx    on campaign_members(user_id);
create index campaign_members_campaign_id_idx on campaign_members(campaign_id);

alter table campaign_members enable row level security;

create policy "campaign_members: read own"
  on campaign_members for select
  using (auth.uid() = user_id);

create policy "campaign_members: join"
  on campaign_members for insert
  with check (auth.uid() = user_id);

create policy "campaign_members: leave"
  on campaign_members for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Update campaigns read policy to include campaign_members
-- ---------------------------------------------------------------------------

drop policy "campaigns: members can read" on campaigns;

create policy "campaigns: members can read"
  on campaigns for select
  using (
    auth.uid() = dm_user_id
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = campaigns.id
        and campaign_members.user_id = auth.uid()
    )
    or exists (
      select 1 from characters
      where characters.campaign_id = campaigns.id
        and characters.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- Security-definer function: look up a campaign by join code
-- Bypasses RLS so unauthenticated-to-campaign users can find it by its code.
-- The join code acts as a capability token — 6-char uppercase alphanumeric
-- gives ~2.8B possibilities, making guessing impractical.
-- ---------------------------------------------------------------------------

create or replace function get_campaign_by_join_code(p_join_code text)
returns setof campaigns
language sql
security definer
set search_path = public
as $$
  select * from campaigns where join_code = upper(trim(p_join_code)) limit 1;
$$;
