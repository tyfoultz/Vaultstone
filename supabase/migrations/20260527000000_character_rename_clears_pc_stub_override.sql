-- Character rename now always propagates to the linked PC stub
-- page's title, even when the page's title was previously edited in
-- the wiki (title_overridden = true). The previous behavior — skip
-- the page when title_overridden = true — meant that a player who'd
-- ever hand-edited their stub page title would silently lose
-- subsequent character renames.
--
-- New rule: renaming the character is authoritative. Sync the page
-- title and reset title_overridden to false so the page tracks the
-- character again going forward. Players who really want a separate
-- wiki title can re-edit the page after the rename.

create or replace function public.tr_characters_sync_stubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.name is distinct from OLD.name then
    update public.world_pages
    set title           = NEW.name,
        title_overridden = false,
        updated_at      = now()
    where character_id = NEW.id
      and page_kind    = 'pc_stub'
      and deleted_at is null;
  end if;

  return NEW;
end;
$$;
