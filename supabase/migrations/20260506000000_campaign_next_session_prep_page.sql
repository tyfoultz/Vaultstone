-- Links a world page to the next session as DM prep notes.
-- Auto-detected from page title or manually set by the DM.
alter table public.campaigns
  add column if not exists next_session_prep_page_id uuid references public.world_pages(id) on delete set null;
