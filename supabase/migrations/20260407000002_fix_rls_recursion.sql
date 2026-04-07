-- =============================================================================
-- Fix infinite RLS recursion between campaigns ↔ characters
--
-- Root cause: campaigns read policy checks characters table, which has its own
-- RLS policy that checks campaigns — creating an infinite loop on any SELECT.
--
-- Fix: security-definer helper functions that query tables without going through
-- RLS, breaking the cycle. All cross-referencing policies are replaced to use them.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper: is the current user the DM of a given campaign?
-- Queries campaigns directly (no RLS) — safe because we only expose a boolean.
-- ---------------------------------------------------------------------------
create or replace function is_campaign_dm(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from campaigns
    where id = p_campaign_id
      and dm_user_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of a given campaign?
-- Member = DM, campaign_members row, or has a character in the campaign.
-- Queries all three tables without RLS — safe, only returns boolean.
-- ---------------------------------------------------------------------------
create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from campaigns       where id          = p_campaign_id and dm_user_id  = auth.uid())
    or exists (select 1 from campaign_members where campaign_id = p_campaign_id and user_id     = auth.uid())
    or exists (select 1 from characters   where campaign_id = p_campaign_id and user_id     = auth.uid());
$$;


-- ---------------------------------------------------------------------------
-- campaigns — replace recursive read policy
-- ---------------------------------------------------------------------------
drop policy "campaigns: members can read" on campaigns;

create policy "campaigns: members can read"
  on campaigns for select
  using (is_campaign_member(id));


-- ---------------------------------------------------------------------------
-- characters — replace recursive read policy
-- ---------------------------------------------------------------------------
drop policy "characters: owner or dm can read" on characters;

create policy "characters: owner or dm can read"
  on characters for select
  using (auth.uid() = user_id or is_campaign_dm(campaign_id));


-- ---------------------------------------------------------------------------
-- sessions — replace recursive read policy
-- ---------------------------------------------------------------------------
drop policy "sessions: members can read" on sessions;

create policy "sessions: members can read"
  on sessions for select
  using (is_campaign_member(campaign_id));

drop policy "sessions: dm can insert" on sessions;

create policy "sessions: dm can insert"
  on sessions for insert
  with check (is_campaign_dm(campaign_id));

drop policy "sessions: dm can update" on sessions;

create policy "sessions: dm can update"
  on sessions for update
  using (is_campaign_dm(campaign_id));


-- ---------------------------------------------------------------------------
-- initiative_order — replace recursive policies
-- ---------------------------------------------------------------------------
drop policy "initiative_order: members can read" on initiative_order;

create policy "initiative_order: members can read"
  on initiative_order for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = initiative_order.session_id
        and is_campaign_member(sessions.campaign_id)
    )
  );

drop policy "initiative_order: dm can insert" on initiative_order;

create policy "initiative_order: dm can insert"
  on initiative_order for insert
  with check (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and is_campaign_dm(sessions.campaign_id)
    )
  );

drop policy "initiative_order: dm can update" on initiative_order;

create policy "initiative_order: dm can update"
  on initiative_order for update
  using (
    exists (
      select 1 from sessions
      where sessions.id = initiative_order.session_id
        and is_campaign_dm(sessions.campaign_id)
    )
  );

drop policy "initiative_order: dm can delete" on initiative_order;

create policy "initiative_order: dm can delete"
  on initiative_order for delete
  using (
    exists (
      select 1 from sessions
      where sessions.id = initiative_order.session_id
        and is_campaign_dm(sessions.campaign_id)
    )
  );


-- ---------------------------------------------------------------------------
-- session_events — replace recursive policies
-- ---------------------------------------------------------------------------
drop policy "session_events: members can read" on session_events;

create policy "session_events: members can read"
  on session_events for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = session_events.session_id
        and is_campaign_member(sessions.campaign_id)
    )
  );

drop policy "session_events: members can insert" on session_events;

create policy "session_events: members can insert"
  on session_events for insert
  with check (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and is_campaign_member(sessions.campaign_id)
    )
  );


-- ---------------------------------------------------------------------------
-- homebrew_content — replace recursive read policy
-- ---------------------------------------------------------------------------
drop policy "homebrew_content: owner can read own" on homebrew_content;

create policy "homebrew_content: owner can read own"
  on homebrew_content for select
  using (
    auth.uid() = user_id
    or (
      is_published = true
      and campaign_id is not null
      and is_campaign_member(campaign_id)
    )
  );
