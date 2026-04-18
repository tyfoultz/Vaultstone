-- Phase 4d — per-page permission grants.
--
-- GMs can grant named users view/edit access to a page even when the user
-- isn't a linked-campaign member. A grant with `cascade = true` extends
-- to every descendant of the page (via `parent_page_id`) so that granting
-- access to a "Campaign arc" page, for example, also grants access to
-- every NPC / location / faction page nested underneath.
--
-- The permission enum is ordered ('view' < 'edit'); a user's effective
-- permission on a page is the MAX across direct + inherited grants.

create type public.world_page_permission_level as enum ('view', 'edit');

create table if not exists public.world_page_permissions (
  page_id     uuid not null references world_pages(id) on delete cascade,
  user_id     uuid not null references auth.users(id)  on delete cascade,
  permission  world_page_permission_level not null default 'view',
  cascade     boolean not null default false,
  granted_by  uuid not null references auth.users(id),
  granted_at  timestamptz not null default now(),
  primary key (page_id, user_id)
);

create index if not exists world_page_permissions_user_idx
  on world_page_permissions (user_id);

-- RLS: world owners manage all grants on their pages. Grantees can see
-- their own rows (so ShareModal "pages shared with me" flows work later).
alter table world_page_permissions enable row level security;

drop policy if exists world_page_permissions_owner_all on world_page_permissions;
create policy world_page_permissions_owner_all on world_page_permissions
  for all
  using (
    exists (
      select 1 from world_pages p
      join worlds w on w.id = p.world_id
      where p.id = world_page_permissions.page_id
        and w.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from world_pages p
      join worlds w on w.id = p.world_id
      where p.id = world_page_permissions.page_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists world_page_permissions_grantee_select on world_page_permissions;
create policy world_page_permissions_grantee_select on world_page_permissions
  for select
  using (user_id = auth.uid());

-- Walk ancestor chain via a recursive CTE, collecting (user, permission)
-- pairs from any grant on the page or on an ancestor with cascade=true.
-- Reused by user_can_view_page / user_can_edit_page.
create or replace function public.effective_page_permission(
  p_user_id uuid,
  p_page_id uuid
)
returns world_page_permission_level
language sql
security definer
set search_path = public
stable
as $$
  with recursive ancestors as (
    select p.id, p.parent_page_id, 0 as depth
    from world_pages p
    where p.id = p_page_id
    union all
    select p.id, p.parent_page_id, a.depth + 1
    from world_pages p
    join ancestors a on p.id = a.parent_page_id
    where a.depth < 8
  ),
  grants as (
    select g.permission
    from world_page_permissions g
    join ancestors a on a.id = g.page_id
    where g.user_id = p_user_id
      and (a.depth = 0 or g.cascade = true)
  )
  select case
    when exists (select 1 from grants where permission = 'edit') then 'edit'::world_page_permission_level
    when exists (select 1 from grants) then 'view'::world_page_permission_level
    else null
  end;
$$;

grant execute on function public.effective_page_permission(uuid, uuid) to authenticated;

-- Extend the 4c helpers to honor permission grants.
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
        w.owner_user_id = p_user_id
        or effective_page_permission(p_user_id, p_page_id) is not null
        or (
          p.visible_to_players = true
          and s.deleted_at is null
          and s.force_hidden_from_players = false
          and exists (
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
        )
      )
  );
$$;

create or replace function public.user_can_edit_page(p_user_id uuid, p_page_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from world_pages p
    join worlds w on w.id = p.world_id
    where p.id = p_page_id
      and p.deleted_at is null
      and w.deleted_at is null
      and (
        w.owner_user_id = p_user_id
        or effective_page_permission(p_user_id, p_page_id) = 'edit'
      )
  );
$$;

-- Add an edit policy so grantees can UPDATE pages when their permission is
-- 'edit'. Owner-only INSERT/DELETE stays (via world_pages_owner_all) — only
-- owners can create/delete pages; grantees can edit contents of existing ones.
drop policy if exists world_pages_grantee_update on world_pages;
create policy world_pages_grantee_update on world_pages
  for update
  using (user_can_edit_page(auth.uid(), id))
  with check (user_can_edit_page(auth.uid(), id));