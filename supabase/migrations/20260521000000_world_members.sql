-- World Members — direct user membership in a world (campaign-less sharing).
--
-- A world owner can invite users as members. Members see the world in their
-- worlds list and can view all `visible_to_players` pages (in non-hidden
-- sections), plus any pages they have explicit `world_page_permissions` grants
-- on. This mirrors the campaign-member path but without requiring a campaign.

-- ─────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.world_members (
  world_id    uuid not null references worlds(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  invited_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  primary key (world_id, user_id)
);

create index if not exists world_members_user_idx
  on world_members(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Security-definer helper — breaks RLS recursion between worlds ↔ world_members.
-- Only queries world_members (never worlds), so it's safe for policies on
-- both tables to call.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.is_world_member(p_world_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from world_members wm
    where wm.world_id = p_world_id
      and wm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_world_member(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table world_members enable row level security;

-- Owner manages all membership rows for their worlds.
drop policy if exists world_members_owner_all on world_members;
create policy world_members_owner_all on world_members
  for all
  using (
    exists (
      select 1 from worlds w
      where w.id = world_members.world_id
        and w.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from worlds w
      where w.id = world_members.world_id
        and w.owner_user_id = auth.uid()
    )
  );

-- Members can see their own membership row + other members of the same world.
drop policy if exists world_members_member_select on world_members;
create policy world_members_member_select on world_members
  for select
  using (is_world_member(world_id));

-- ─────────────────────────────────────────────────────────────────────────
-- Extend worlds SELECT policy to include direct members.
-- Uses the security-definer helper to avoid RLS recursion.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists worlds_member_select on worlds;
create policy worlds_member_select on worlds
  for select
  using (is_world_member(id));

-- ─────────────────────────────────────────────────────────────────────────
-- Extend world_sections SELECT to include direct members.
-- Members see non-hidden sections (same filter as campaign members).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists world_sections_member_select on world_sections;
create policy world_sections_member_select on world_sections
  for select
  using (
    deleted_at is null
    and force_hidden_from_players = false
    and is_world_member(world_id)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Extend user_can_view_page to honor world membership.
-- Members see visible_to_players pages + explicit grants (already handled
-- by the existing effective_page_permission branch).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.user_can_view_page(p_user_id uuid, p_page_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from world_pages p
    join world_sections s on s.id = p.section_id
    join worlds w on w.id = p.world_id
    where p.id = p_page_id
      and p.deleted_at is null
      and w.deleted_at is null
      and (
        -- World owner always sees everything
        w.owner_user_id = p_user_id
        -- Explicit page grant (direct or inherited via cascade)
        or effective_page_permission(p_user_id, p_page_id) is not null
        -- Player-visible path: campaign members OR direct world members
        or (
          p.visible_to_players = true
          and s.deleted_at is null
          and s.force_hidden_from_players = false
          and (
            -- Campaign member path
            exists (
              select 1
              from world_campaigns wc
              join campaigns c on c.id = wc.campaign_id
              where wc.world_id = p.world_id
                and (
                  c.dm_user_id = p_user_id
                  or exists (
                    select 1 from campaign_members cm
                    where cm.campaign_id = wc.campaign_id
                      and cm.user_id = p_user_id
                  )
                  or exists (
                    select 1 from characters ch
                    where ch.campaign_id = wc.campaign_id
                      and ch.user_id = p_user_id
                  )
                )
            )
            -- Direct world member path
            or exists (
              select 1 from world_members wm
              where wm.world_id = p.world_id
                and wm.user_id = p_user_id
            )
          )
        )
      )
  );
$$;
