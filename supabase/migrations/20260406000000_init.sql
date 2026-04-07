-- =============================================================================
-- Vaultstone — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy text search on names


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Tables (all created first so RLS policies can reference any table freely)
-- ---------------------------------------------------------------------------

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create table game_systems (
  id            text primary key,
  display_name  text not null,
  version       text not null,
  license       text not null,
  is_bundled    boolean not null default false,
  definition    jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  dm_user_id  uuid not null references profiles(id) on delete cascade,
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

create table characters (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  system       text not null references game_systems(id),
  base_stats   jsonb not null default '{}',
  resources    jsonb not null default '{}',
  conditions   text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  round        integer not null default 0
);

create table initiative_order (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  character_id   uuid references characters(id) on delete set null,
  display_name   text not null,
  init_value     integer not null,
  hp_current     integer not null,
  hp_max         integer not null,
  ac             integer not null,
  is_active_turn boolean not null default false,
  sort_order     integer not null
);

create table session_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  event_type  text not null,
  actor_id    uuid references profiles(id) on delete set null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create table homebrew_content (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references campaigns(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  content_type  text not null,
  name          text not null,
  data          jsonb not null,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index campaigns_dm_user_id_idx         on campaigns(dm_user_id);
create index campaigns_join_code_idx          on campaigns(join_code);
create index characters_campaign_id_idx       on characters(campaign_id);
create index characters_user_id_idx           on characters(user_id);
create index sessions_campaign_id_idx         on sessions(campaign_id);
create index initiative_order_session_id_idx  on initiative_order(session_id);
create index session_events_session_id_idx    on session_events(session_id);
create index session_events_created_at_idx    on session_events(created_at);
create index homebrew_content_user_id_idx     on homebrew_content(user_id);
create index homebrew_content_campaign_id_idx on homebrew_content(campaign_id);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger characters_updated_at
  before update on characters
  for each row execute function handle_updated_at();

-- Auto-create profile row when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles          enable row level security;
alter table game_systems      enable row level security;
alter table campaigns         enable row level security;
alter table characters        enable row level security;
alter table sessions          enable row level security;
alter table initiative_order  enable row level security;
alter table session_events    enable row level security;
alter table homebrew_content  enable row level security;


-- profiles
create policy "profiles: anyone can read"
  on profiles for select using (true);

create policy "profiles: users update own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- game_systems
create policy "game_systems: anyone can read"
  on game_systems for select using (true);

create policy "game_systems: no public insert"
  on game_systems for insert with check (false);

create policy "game_systems: no public update"
  on game_systems for update using (false);


-- campaigns
create policy "campaigns: members can read"
  on campaigns for select
  using (
    auth.uid() = dm_user_id
    or exists (
      select 1 from characters
      where characters.campaign_id = campaigns.id
        and characters.user_id = auth.uid()
    )
  );

create policy "campaigns: dm can insert"
  on campaigns for insert
  with check (auth.uid() = dm_user_id);

create policy "campaigns: dm can update"
  on campaigns for update
  using (auth.uid() = dm_user_id)
  with check (auth.uid() = dm_user_id);

create policy "campaigns: dm can delete"
  on campaigns for delete
  using (auth.uid() = dm_user_id);


-- characters
create policy "characters: owner or dm can read"
  on characters for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from campaigns
      where campaigns.id = characters.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "characters: owner can insert"
  on characters for insert
  with check (auth.uid() = user_id);

create policy "characters: owner can update"
  on characters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "characters: owner can delete"
  on characters for delete
  using (auth.uid() = user_id);


-- sessions
create policy "sessions: members can read"
  on sessions for select
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = sessions.campaign_id
        and (
          campaigns.dm_user_id = auth.uid()
          or exists (
            select 1 from characters
            where characters.campaign_id = campaigns.id
              and characters.user_id = auth.uid()
          )
        )
    )
  );

create policy "sessions: dm can insert"
  on sessions for insert
  with check (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "sessions: dm can update"
  on sessions for update
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = sessions.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
  );


-- initiative_order
create policy "initiative_order: members can read"
  on initiative_order for select
  using (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = initiative_order.session_id
        and (
          campaigns.dm_user_id = auth.uid()
          or exists (
            select 1 from characters
            where characters.campaign_id = campaigns.id
              and characters.user_id = auth.uid()
          )
        )
    )
  );

create policy "initiative_order: dm can insert"
  on initiative_order for insert
  with check (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = session_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "initiative_order: dm can update"
  on initiative_order for update
  using (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = initiative_order.session_id
        and campaigns.dm_user_id = auth.uid()
    )
  );

create policy "initiative_order: dm can delete"
  on initiative_order for delete
  using (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = initiative_order.session_id
        and campaigns.dm_user_id = auth.uid()
    )
  );


-- session_events (append-only — no UPDATE policy)
create policy "session_events: members can read"
  on session_events for select
  using (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = session_events.session_id
        and (
          campaigns.dm_user_id = auth.uid()
          or exists (
            select 1 from characters
            where characters.campaign_id = campaigns.id
              and characters.user_id = auth.uid()
          )
        )
    )
  );

create policy "session_events: members can insert"
  on session_events for insert
  with check (
    exists (
      select 1 from sessions
      join campaigns on campaigns.id = sessions.campaign_id
      where sessions.id = session_id
        and (
          campaigns.dm_user_id = auth.uid()
          or exists (
            select 1 from characters
            where characters.campaign_id = campaigns.id
              and characters.user_id = auth.uid()
          )
        )
    )
  );


-- homebrew_content
create policy "homebrew_content: owner can read own"
  on homebrew_content for select
  using (
    auth.uid() = user_id
    or (
      is_published = true
      and campaign_id is not null
      and exists (
        select 1 from campaigns
        where campaigns.id = homebrew_content.campaign_id
          and (
            campaigns.dm_user_id = auth.uid()
            or exists (
              select 1 from characters
              where characters.campaign_id = campaigns.id
                and characters.user_id = auth.uid()
            )
          )
      )
    )
  );

create policy "homebrew_content: owner can insert"
  on homebrew_content for insert
  with check (auth.uid() = user_id);

create policy "homebrew_content: owner can update"
  on homebrew_content for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "homebrew_content: owner can delete"
  on homebrew_content for delete
  using (auth.uid() = user_id);
