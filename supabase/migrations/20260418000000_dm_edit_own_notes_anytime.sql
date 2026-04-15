-- Epic 8 (Campaign Notes Hub) — DM can revise their own session notes from any
-- past session, not just the live one. Players stay locked to `ended_at IS NULL`
-- so the DM's recap can rely on player notes being frozen at end-of-session.

drop policy if exists "session_notes: own update while live" on public.session_notes;

create policy "session_notes: own update (dm anytime, player live only)"
  on public.session_notes for update
  using (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.sessions s
        where s.id = session_id and s.ended_at is null
      )
      or is_campaign_dm(
        (select campaign_id from public.sessions where id = session_id)
      )
    )
  )
  with check (auth.uid() = user_id);
