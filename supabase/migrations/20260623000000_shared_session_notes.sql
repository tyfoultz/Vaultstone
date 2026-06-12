-- DM-shared session notes.
--
-- Session notes are per-user and private: each participant reads only
-- their own row (the DM additionally reads everyone's via
-- `dm reads all during live session`). Players had no way to see what
-- the DM wanted to surface to the table.
--
-- This adds an opt-in share flag the DM toggles on their own note. When
-- set, every campaign member may read that one row (read-only), and the
-- floating notes overlay shows it live to players via Realtime.

alter table public.session_notes
  add column if not exists shared boolean not null default false;

-- Campaign members can read a session_notes row the author has shared,
-- as long as they belong to the session's campaign. Additive to the
-- existing owner/DM policies (RLS policies are OR'd), so it only widens
-- read access for explicitly-shared rows. `is_campaign_member` is a
-- security-definer helper, so this never recurses into session_notes.
drop policy if exists "session_notes: members read shared" on public.session_notes;
create policy "session_notes: members read shared"
  on public.session_notes for select
  using (
    shared = true
    and is_campaign_member(
      (select campaign_id from public.sessions where id = session_id)
    )
  );

-- Live propagation: players' overlays refetch the shared note when the
-- DM edits or toggles it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'session_notes'
  ) then
    alter publication supabase_realtime add table session_notes;
  end if;
end $$;
