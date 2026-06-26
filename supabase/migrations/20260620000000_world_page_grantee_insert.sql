-- Allow users with edit access to a page to create sub-pages beneath it.
-- Prior policy: only world owners could INSERT into world_pages.
-- New policy: edit grantees may also insert when parent_page_id is set
-- and they have edit access to that parent.
drop policy if exists world_pages_grantee_insert on world_pages;
create policy world_pages_grantee_insert on world_pages
  for insert
  with check (
    parent_page_id is not null
    and user_can_edit_page(auth.uid(), parent_page_id)
  );
