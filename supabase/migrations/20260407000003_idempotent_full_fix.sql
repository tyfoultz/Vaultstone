-- =============================================================================
-- Idempotent full fix — safe to run regardless of whether 001 or 002 were applied.
--
-- Combines campaign_members table creation + RLS recursion fix in correct order.
-- Uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS throughout.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. campaign_members table
-- ---------------------------------------------------------------------------

create table if not exists campaign_members (
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  user_id      uuid not null references profiles(id)  on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists campaign_members_user_id_idx     on campaign_members(user_id);
create index if not exists campaign_members_campaign_id_idx on campaign_members(campaign_id);

alter table campaign_members enable row level security;

-- Drop then recreate so re-runs are safe
drop policy if exists "campaign_members: read own" on campaign_members;
create policy "campaign_members: read own"
  on campaign_members for select
  using (auth.uid() = user_id);

drop policy if exists "campaign_members: join" on campaign_members;
create policy "campaign_members: join"
  on campaign_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "campaign_members: leave" on campaign_members;
create policy "campaign_members: leave"
  on campaign_members for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 2. Security-definer helpers (break RLS recursion)
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

create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from campaigns       where id          = p_campaign_id and dm_user_id = auth.uid())
    or exists (select 1 from campaign_members where campaign_id = p_campaign_id and user_id    = auth.uid())
    or exists (select 1 from characters   where campaign_id = p_campaign_id and user_id    = auth.uid());
$$;

create or replace function get_campaign_by_join_code(p_join_code text)
returns setof campaigns
language sql
security definer
set search_path = public
as $$
  select * from campaigns where join_code = upper(trim(p_join_code)) limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 3. campaigns policies (drop all, recreate clean)
-- ---------------------------------------------------------------------------

drop policy if exists "campaigns: members can read" on campaigns;
create policy "campaigns: members can read"
  on campaigns for select
  using (is_campaign_member(id));

drop policy if exists "campaigns: dm can insert" on campaigns;
create policy "campaigns: dm can insert"
  on campaigns for insert
  with check (auth.uid() = dm_user_id);

drop policy if exists "campaigns: dm can update" on campaigns;
create policy "campaigns: dm can update"
  on campaigns for update
  using (auth.uid() = dm_user_id)
  with check (auth.uid() = dm_user_id);

drop policy if exists "campaigns: dm can delete" on campaigns;
create policy "campaigns: dm can delete"
  on campaigns for delete
  using (auth.uid() = dm_user_id);


-- ---------------------------------------------------------------------------
-- 4. characters policies
-- ---------------------------------------------------------------------------

drop policy if exists "characters: owner or dm can read" on characters;
create policy "characters: owner or dm can read"
  on characters for select
  using (auth.uid() = user_id or is_campaign_dm(campaign_id));

drop policy if exists "characters: owner can insert" on characters;
create policy "characters: owner can insert"
  on characters for insert
  with check (auth.uid() = user_id);

drop policy if exists "characters: owner can update" on characters;
create policy "characters: owner can update"
  on characters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "characters: owner can delete" on characters;
create policy "characters: owner can delete"
  on characters for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 5. sessions policies
-- ---------------------------------------------------------------------------

drop policy if exists "sessions: members can read" on sessions;
create policy "sessions: members can read"
  on sessions for select
  using (is_campaign_member(campaign_id));

drop policy if exists "sessions: dm can insert" on sessions;
create policy "sessions: dm can insert"
  on sessions for insert
  with check (is_campaign_dm(campaign_id));

drop policy if exists "sessions: dm can update" on sessions;
create policy "sessions: dm can update"
  on sessions for update
  using (is_campaign_dm(campaign_id));


-- ---------------------------------------------------------------------------
-- 6. initiative_order policies
-- ---------------------------------------------------------------------------

drop policy if exists "initiative_order: members can read" on initiative_order;
create policy "initiative_order: members can read"
  on initiative_order for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = initiative_order.session_id
        and is_campaign_member(sessions.campaign_id)
    )
  );

drop policy if exists "initiative_order: dm can insert" on initiative_order;
create policy "initiative_order: dm can insert"
  on initiative_order for insert
  with check (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and is_campaign_dm(sessions.campaign_id)
    )
  );

drop policy if exists "initiative_order: dm can update" on initiative_order;
create policy "initiative_order: dm can update"
  on initiative_order for update
  using (
    exists (
      select 1 from sessions
      where sessions.id = initiative_order.session_id
        and is_campaign_dm(sessions.campaign_id)
    )
  );

drop policy if exists "initiative_order: dm can delete" on initiative_order;
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
-- 7. session_events policies
-- ---------------------------------------------------------------------------

drop policy if exists "session_events: members can read" on session_events;
create policy "session_events: members can read"
  on session_events for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = session_events.session_id
        and is_campaign_member(sessions.campaign_id)
    )
  );

drop policy if exists "session_events: members can insert" on session_events;
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
-- 8. homebrew_content policies
-- ---------------------------------------------------------------------------

drop policy if exists "homebrew_content: owner can read own" on homebrew_content;
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

drop policy if exists "homebrew_content: owner can insert" on homebrew_content;
create policy "homebrew_content: owner can insert"
  on homebrew_content for insert
  with check (auth.uid() = user_id);

drop policy if exists "homebrew_content: owner can update" on homebrew_content;
create policy "homebrew_content: owner can update"
  on homebrew_content for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "homebrew_content: owner can delete" on homebrew_content;
create policy "homebrew_content: owner can delete"
  on homebrew_content for delete
  using (auth.uid() = user_id);
