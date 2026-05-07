-- Auto-clear the campaign window-pane pins when a session ends.
--
-- Spec: pins are session-scoped framing. Between sessions the pane
-- shows the world banner (scene) and hides the subject. We could
-- enforce that at read time (treat any pin as null when no session
-- is active), but that breaks the "DM can pre-stage scenes ahead of
-- a session" workflow. Instead, clear pins exactly when the session
-- ends so they fall back naturally and the next session starts
-- clean.
--
-- Trigger fires when sessions.ended_at transitions from null →
-- not-null (the canonical "session is now over" event). UPDATEs
-- that touch ended_at while it's already non-null (e.g. summary
-- edits) don't re-fire.

create or replace function public.clear_campaign_window_pane_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act on the null → not-null transition.
  if old.ended_at is null and new.ended_at is not null then
    update public.campaigns
       set scene_image_id = null,
           subject_image_id = null
     where id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_campaign_window_pane_on_session_end on public.sessions;
create trigger clear_campaign_window_pane_on_session_end
after update of ended_at on public.sessions
for each row
execute function public.clear_campaign_window_pane_on_session_end();
