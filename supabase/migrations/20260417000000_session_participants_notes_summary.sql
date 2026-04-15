-- Session restructure: participants, per-user notes, end-of-session summary.
--
-- Sessions become a richer concept than just the combat tracker:
--   * DM picks who's in (session_participants).
--   * Each participant + DM gets a private notes blob (session_notes).
--   * DM writes an optional recap on End Session (sessions.summary).
--   * After end, every campaign member sees every note (catch-up for
--     missed players + DM debrief).

-- ---------------------------------------------------------------------------
-- 1. Recap column on sessions
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists summary text;

-- ---------------------------------------------------------------------------
-- 2. session_participants — DM-curated roster for each session
-- ---------------------------------------------------------------------------
create table if not exists public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists session_participants_user_idx
  on public.session_participants(user_id);

alter table public.session_participants enable row level security;

-- Anyone in the campaign can see who's participating.
create policy "session_participants: members read"
  on public.session_participants for select
  using (
    is_campaign_member(
      (select campaign_id from public.sessions where id = session_id)
    )
  );

-- Only the DM of the session's campaign can add/remove participants.
create policy "session_participants: dm insert"
  on public.session_participants for insert
  with check (
    is_campaign_dm(
      (select campaign_id from public.sessions where id = session_id)
    )
  );

create policy "session_participants: dm delete"
  on public.session_participants for delete
  using (
    is_campaign_dm(
      (select campaign_id from public.sessions where id = session_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. session_notes — one private blob per (session, user)
-- ---------------------------------------------------------------------------
create table if not exists public.session_notes (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists session_notes_user_idx
  on public.session_notes(user_id);

alter table public.session_notes enable row level security;

-- SELECT: own notes anytime; everyone else's notes only after the session
-- has ended (and only if the viewer is in the campaign).
create policy "session_notes: own or post-end member read"
  on public.session_notes for select
  using (
    auth.uid() = user_id
    or (
      exists (
        select 1 from public.sessions s
        where s.id = session_id and s.ended_at is not null
      )
      and is_campaign_member(
        (select campaign_id from public.sessions where id = session_id)
      )
    )
  );

-- INSERT/UPDATE: only your own row, only while the session is live.
create policy "session_notes: own insert while live"
  on public.session_notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.ended_at is null
    )
  );

create policy "session_notes: own update while live"
  on public.session_notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.ended_at is null
    )
  )
  with check (auth.uid() = user_id);
