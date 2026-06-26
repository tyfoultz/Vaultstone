-- Per-user daily AI usage counter, protecting the shared free-tier Gemini key
-- from a single user draining the daily quota. No message content is stored —
-- only a count per user per UTC day. This is the ONLY server-side row the
-- assistant writes; chat history stays device-local.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
-- Intentionally no client RLS policies — only the security-definer RPC below
-- reads/writes this table. The client never touches it directly.

-- Atomically increment today's count for the calling user and report whether
-- they may proceed (post-increment count <= cap). The ai-chat Edge Function
-- calls this once per fresh user turn (not per tool round-trip).
create or replace function public.bump_ai_usage(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  insert into public.ai_usage (user_id, day, count)
    values (auth.uid(), v_day, 1)
  on conflict (user_id, day)
    do update set count = public.ai_usage.count + 1
  returning count into v_count;
  return v_count <= p_cap;
end;
$$;

grant execute on function public.bump_ai_usage(integer) to authenticated;
