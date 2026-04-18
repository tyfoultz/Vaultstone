-- Phase 4c — RLS helper functions for per-page view/edit checks.
--
-- Today the `world_pages_linked_member_select` and `world_pages_owner_all`
-- policies inline their checks. Phase 4 introduces (a) `world_page_permissions`
-- grants that let named users view or edit a page even when they aren't a
-- linked-campaign member, and (b) a Player View preview mode that needs to
-- answer "would user X be able to see this page?" outside of RLS. Both use
-- cases want a named helper, so we extract the logic here.
--
-- The helpers take an explicit `p_user_id` (not auth.uid()) so they're usable
-- for preview simulations. Policies still call them with auth.uid() inside.
-- Phase 4d will ALTER these functions to also consult `world_page_permissions`.

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
        or (
          -- Player / co-GM view path: page must be visible, section must
          -- not be force-hidden, and the user must be a member of at least
          -- one campaign linked to this world.
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
      and w.owner_user_id = p_user_id
  );
$$;

grant execute on function public.user_can_view_page(uuid, uuid) to authenticated;
grant execute on function public.user_can_edit_page(uuid, uuid) to authenticated;

-- Refactor existing `world_pages_linked_member_select` to call the helper.
-- Behavior unchanged — this sets the policy up for Phase 4d to pick up
-- permission-grant support automatically when the helper's body is extended.
drop policy if exists world_pages_linked_member_select on world_pages;
create policy world_pages_linked_member_select on world_pages
  for select
  using (user_can_view_page(auth.uid(), id));
