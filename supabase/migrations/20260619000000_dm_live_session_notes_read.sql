-- Allow the DM to read all session_notes during a live session.
-- Previously DMs could only see other users' notes post-session.
-- This enables the floating DM notes overlay to show player notes
-- in real time during an active session.

create policy "session_notes: dm reads all during live session"
  on public.session_notes for select
  using (
    is_campaign_dm(
      (select campaign_id from public.sessions where id = session_id)
    )
  );
